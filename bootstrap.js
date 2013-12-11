/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Author:
 *   Girish Sharma <scrapmachines@gmail.com>
 */

"use strict";
let {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const STYLE_URL = Services.io.newURI("chrome://custom-standalone-image-backgrounds/skin/style.css", null, null);
const HTML = "http://www.w3.org/1999/xhtml";
const DEFAULT_BACKGROUND = "url('chrome://global/skin/media/imagedoc-darknoise.png') repeat scroll 0% 0% rgb(30,30,30)";
const INDEX_PREF = "extensions.customStandaloneImageBackgrounds.selectedPresetIndex";
const PRESET_PREF = "extensions.customStandaloneImageBackgrounds.customPresets";

let backgroundPresets = [];

let worker = null;

function disable(id) {
  AddonManager.getAddonByID(id, function(addon) {
    addon.userDisabled = true;
  });
}

function unload(callback, container) {
  // Initialize the array of unloaders on the first usage
  let unloaders = unload.unloaders;
  if (unloaders == null)
    unloaders = unload.unloaders = [];

  // Calling with no arguments runs all the unloader callbacks
  if (callback == null) {
    unloaders.slice().forEach(function(unloader) unloader());
    unloaders.length = 0;
    return;
  }

  // The callback is bound to the lifetime of the container if we have one
  if (container != null) {
    // Remove the unloader when the container unloads
    container.addEventListener("unload", removeUnloader, false);

    // Wrap the callback to additionally remove the unload listener
    let origCallback = callback;
    callback = function() {
      container.removeEventListener("unload", removeUnloader, false);
      origCallback();
    }
  }

  // Wrap the callback in a function that ignores failures
  function unloader() {
    try {
      callback();
    }
    catch(ex) {}
  }
  unloaders.push(unloader);

  // Provide a way to remove the unloader
  function removeUnloader() {
    let index = unloaders.indexOf(unloader);
    if (index != -1)
      unloaders.splice(index, 1);
  }
  return removeUnloader;
}

function loadStyleSheet() {
  let sss = Cc["@mozilla.org/content/style-sheet-service;1"].
    getService(Ci.nsIStyleSheetService);
  sss.loadAndRegisterSheet(STYLE_URL, sss.USER_SHEET);
  unload(function() sss.unregisterSheet(STYLE_URL, sss.USER_SHEET));
}

function addPinnerToPane(aDocument, aPane) {
  let pinDiv = aDocument.createElementNS(HTML, 'div');
  pinDiv.id = "standalone-image-pane-pinner";
  let onPinClick = function() {
    aPane.setAttribute("pinned", "true" !== aPane.getAttribute("pinned"));
    aDocument.querySelector("img")
             .setAttribute("custom-standalone-background-panel-pinned",
                           aPane.getAttribute("pinned"));
  };
  pinDiv.addEventListener("click", onPinClick, false);
  unload(function() {
    pinDiv.removeEventListener("click", onPinClick, false);
    aDocument.querySelector("img")
             .removeAttribute("custom-standalone-background-panel-pinned");
  }, aDocument.defaultView);
  aPane.appendChild(pinDiv);
}

function addPresetToPane(aDocument, aPane, aPreset, aIndex, aForcedIdnex) {
  let presetDiv = aDocument.createElementNS(HTML, 'div');
  presetDiv.setAttribute('class', 'custom-standalone-image-preset');
  presetDiv.style.background = aPreset;
  if (aForcedIdnex == null) {
    aForcedIdnex = Services.prefs.getIntPref(INDEX_PREF);
  }
  if (aForcedIdnex == aIndex) {
    presetDiv.setAttribute("checked", true);
  }
  let onPresetMousedown = function(event) {
    if (event.button == 0) {
      if (!event.target.hasAttribute("checked")) {
        aDocument.body.style.background = aPreset;
        Array.forEach(event.target.parentNode.childNodes, function(node) {
          try {
            node.removeAttribute("checked");
          } catch (ex) {}
        });
        event.target.setAttribute("checked", true);
        Services.prefs.setIntPref(INDEX_PREF, aIndex);
      }
    }
    else if (event.button == 1 && aIndex > 2) {
      event.stopPropagation();
      event.preventDefault();
      let tempPresets = JSON.parse(Services.prefs.getCharPref(PRESET_PREF));
      if (event.target.hasAttribute("checked")) {
        Services.prefs.setIntPref(INDEX_PREF,
                                  Math.min(aIndex,tempPresets.length + 1));
        aDocument.body.style.background = backgroundPresets[
          Math.min(aIndex + 1,backgroundPresets.length - 2)
        ];
      }
      else if (aIndex < Services.prefs.getIntPref(INDEX_PREF)) {
        Services.prefs.setIntPref(INDEX_PREF,
                                  Math.min(Services.prefs.getIntPref(INDEX_PREF) - 1,
                                           backgroundPresets.length - 2));
      }
      tempPresets.splice(aIndex - 3, 1);
      backgroundPresets.splice(aIndex, 1);
      Services.prefs.setIntPref(INDEX_PREF,
                                Math.min(Services.prefs.getIntPref(INDEX_PREF),
                                         backgroundPresets.length - 1));
      Services.prefs.setCharPref(PRESET_PREF, JSON.stringify(tempPresets));
      presetDiv = null;
      for (let doc in getImageDocuments()) {
        createPane(doc);
        doc.body.style.background = backgroundPresets[
          Services.prefs.getIntPref(INDEX_PREF)
        ];
      }
    }
  };
  presetDiv.addEventListener("mousedown", onPresetMousedown, true);
  unload(function() {
    presetDiv.removeEventListener("mousedown", onPresetMousedown, true);
  }, aDocument.defaultView);
  aPane.appendChild(presetDiv);
}

function addAdderToPane(aDocument, aPane) {
  let pinDiv = aDocument.createElementNS(HTML, 'div');
  pinDiv.id = "standalone-image-pane-adder";
  let onPinClick = function() {
    let newPreset = aDocument.defaultView.prompt("Enter the CSS 'background' value","");
    if (newPreset != null && newPreset != "") {
      let tempPresets = JSON.parse(Services.prefs.getCharPref(PRESET_PREF));
      tempPresets.push(newPreset);
      backgroundPresets.push(newPreset);
      Services.prefs.setIntPref(INDEX_PREF, tempPresets.length + 2);
      Services.prefs.setCharPref(PRESET_PREF, JSON.stringify(tempPresets));
      aDocument.body.style.background = newPreset;
      for (let doc in getImageDocuments()) {
        createPane(doc, aDocument != doc);
      }
    }
  };
  pinDiv.addEventListener("click", onPinClick, false);
  unload(function() {
    pinDiv.removeEventListener("click", onPinClick, false);
  }, aDocument.defaultView);
  aPane.appendChild(pinDiv);
}

function addPickerToPane(aDocument, aPane) {
  function onPickerClickIterator() {
    while(1) {
      let newPreset = yield startColorPicker();
      if (newPreset != null && newPreset != "") {
        let tempPresets = JSON.parse(Services.prefs.getCharPref(PRESET_PREF));
        tempPresets.push(newPreset);
        backgroundPresets.push(newPreset);
        Services.prefs.setIntPref(INDEX_PREF, tempPresets.length + 2);
        Services.prefs.setCharPref(PRESET_PREF, JSON.stringify(tempPresets));
        aDocument.body.style.background = newPreset;
        for (let doc in getImageDocuments()) {
          createPane(doc, aDocument != doc);
        }
      }
      yield null;
    }
  }

  let pinDiv = aDocument.createElementNS(HTML, 'div');
  pinDiv.id = "standalone-image-pane-picker";

  let onPickerClick = onPickerClickIterator();
  let startColorPicker = function() {
    let canvas = aDocument.createElementNS(HTML, "canvas");
    let colorText = aDocument.createElementNS(HTML, "div");
    canvas.id = "standalone-image-color-preview";
    colorText.id = "standalone-image-color-text";
    canvas.width = 1;
    canvas.height = 1;
    let ctx = canvas.getContext('2d');
    ctx.drawWindow(aDocument.defaultView, 0, 0, 1, 1, "rgba(0,0,0,0)");
    ctx.font = "16px sans-serif";
    ctx.lineWidth = 0.5;

    aDocument.body.appendChild(canvas);
    aDocument.body.appendChild(colorText);
    aDocument.body.firstChild.style.cursor = "crosshair";

    let onMouseMove = function(e) {
      canvas.style.top = (e.clientY + 10) + "px";
      colorText.style.top = (e.clientY - 10) + "px";
      colorText.style.left = (e.clientX + 15) + "px";
      canvas.style.left = (e.clientX + 30) + "px";
      let ctx = canvas.getContext('2d');
      ctx.drawWindow(aDocument.defaultView,
                     e.clientX + aDocument.defaultView.scrollX,
                     e.clientY + aDocument.defaultView.scrollY,
                     1, 1, "rgba(0,0,0,0)");
      canvas.style.width = "50px";
      canvas.style.height = "50px";
      let c = ctx.getImageData(0, 0, 1, 1).data;
      colorText.style.color = (((c[0] + c[1] + c[2])/3 < 128) ? "white" : "black");
      colorText.textContent = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
    };
    let onMouseClick = function(e) {
      aDocument.removeEventListener("mousedown", onMouseClick, true);
      aDocument.removeEventListener("mousemove", onMouseMove, true);
      aDocument.removeEventListener("keypress", onKeyPress, true);
      e.stopPropagation();
      e.preventDefault();
      aDocument.body.firstChild.style.cursor = "default";
      canvas.parentNode.removeChild(canvas);
      colorText.parentNode.removeChild(colorText);
      let c = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
      onPickerClick.send("rgb(" + c[0] + "," + c[1] + "," + c[2] + ")");
    };
    let onKeyPress = function(e) {
      if (e.keyCode == e.DOM_VK_ESCAPE) {
        aDocument.removeEventListener("mousedown", onMouseClick, true);
        aDocument.removeEventListener("keypress", onKeyPress, true);
        aDocument.removeEventListener("mousemove", onMouseMove, true);
        e.stopPropagation();
        e.preventDefault();
        aDocument.body.firstChild.style.cursor = "default";
        canvas.parentNode.removeChild(canvas);
        colorText.parentNode.removeChild(colorText);
        onPickerClick.send("");
      }
    };
    aDocument.addEventListener("keypress", onKeyPress, true);
    aDocument.addEventListener("mousedown", onMouseClick, true);
    aDocument.addEventListener("mousemove", onMouseMove, true);
    unload(function() {
      try {
        aDocument.removeEventListener("keypress", onKeyPress, true);
      } catch(ex) {}
      try {
        aDocument.removeEventListener("mousedown", onMouseClick, true);
      } catch(ex) {}
      try {
        aDocument.removeEventListener("mousemove", onMouseMove, true);
      } catch(ex) {}
      aDocument.body.firstChild.style.cursor = "default";
      canvas && canvas.parentNode.removeChild(canvas);
      colorText && colorText.parentNode.removeChild(colorText);
      onKeyPress = onMouseClick = onMouseMove = null;
    }, aDocument.defaultView);
    return null;
  };

  let next = function() {
    onPickerClick.next();
  };

  pinDiv.addEventListener("click", next, false);
  unload(function() {
    pinDiv.removeEventListener("click", next, false);
    startColorPicker = onPickerClick = null;
  }, aDocument.defaultView);
  aPane.appendChild(pinDiv);
}

function createPane(aDocument, aPreserveSelectedIndex) {
  let leftPane = null;
  try {
    leftPane = aDocument.getElementById("custom-standalone-image-side-panel");
  } catch(ex) {}

  let previousIndex = null;
  if (!leftPane) {
    // Adding the left pane
    leftPane = aDocument.createElementNS(HTML, "div");
    leftPane.id = "custom-standalone-image-side-panel";
    leftPane.setAttribute("pinned", false);
    aDocument.body.appendChild(leftPane);
  }
  else {
    let i = -1;
    while (leftPane.firstChild) {
      if (leftPane.firstChild.getAttribute("checked") == "true") {
        previousIndex = i;
      }
      i++;
      leftPane.removeChild(leftPane.firstChild);
    }
  }
  addPinnerToPane(aDocument, leftPane);
  backgroundPresets.forEach(function(preset, index) {
    addPresetToPane(aDocument, leftPane, preset, index,
                    aPreserveSelectedIndex === true? previousIndex: null);
  });
  addAdderToPane(aDocument, leftPane);
  addPickerToPane(aDocument, leftPane);
}

let applyCustomBackground = {
  observe: function(aSubject, aTopic, aData) {
    let doc = aSubject.document;
    let win = doc.defaultView;
    if (typeof doc.imageResizingEnabled !== 'boolean') {
      return;
    }

    let img = doc.body.firstChild;
    img.style.background = "none";

    createPane(doc);

    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      let r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
      return v.toString(16);
    });
    doc.body.setAttribute("standalone-image-backgrounds-uuid", uuid);
    if (doc.readyState == "complete") {
      worker.postMessage(JSON.stringify([getImageData(doc), uuid]));
    }
    else {
      img.addEventListener("load", function onLoad() {
        img.removeEventListener("load", onLoad, true);
        worker.postMessage(JSON.stringify([getImageData(doc), uuid]));
      }, true);
    }

    unload(function() {
      try {
        doc.body.style.background = DEFAULT_BACKGROUND;
        doc.body.removeAttribute("standalone-image-backgrounds-uuid");
      } catch (ex) {}
      leftPane.parentNode.removeChild(leftPane);
      leftPane = null;
    }, win);

    doc.body.style.background = backgroundPresets[
      Services.prefs.getIntPref(INDEX_PREF)
    ] || DEFAULT_BACKGROUND;

    if (doc.body.style.background == DEFAULT_BACKGROUND &&
        Services.prefs.getIntPref(INDEX_PREF) != 0) {
      Services.prefs.setIntPref(INDEX_PREF, 0);
    }

    let changeBackground = function(mutations) {
      let styleChanged = false;
      mutations.forEach(function(mutation) {
        if (mutation.attributeName == "style") {
          styleChanged = true;
          return;
        }
      });
      if (!styleChanged || img.style.background == "none") {
        return;
      }

      observer.disconnect();
      img.style.background = "none";
      observer.observe(img, {attributes: true});
    };

    let observer = new win.MutationObserver(changeBackground);

    observer.observe(img, {attributes: true});

    unload(function() {
      observer.disconnect();
      observer = null;
      img.style.background = "white";
    }, win);
  },
};

function getImageData(doc) {
  let canvas = doc.createElement('canvas'),
      ctx = canvas.getContext('2d'),
      width, height, ratio, imgEl;
  imgEl = doc.body.firstChild;
  ratio = Math.max(Math.ceil((imgEl.naturalWidth + 1)/200), Math.ceil((imgEl.naturalHeight + 1)/200));
  width = canvas.width = imgEl.naturalWidth/ratio;
  height = canvas.height = imgEl.naturalHeight/ratio;
  canvas.style.imageRendering = "-moz-crisp-edges";
  ctx.scale(1/ratio, 1/ratio);
  ctx.drawImage(imgEl, 0, 0);
  return [ctx.getImageData(0, 0, width, height).data, width, height];
}

function getImageDocuments() {
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let window = windows.getNext();
    for (let tab of window.gBrowser.tabs) {
      if (tab.hasAttribute("pending")) {
        continue;
      }
      let doc = window.gBrowser.getBrowserForTab(tab).contentDocument;
      if (typeof doc.imageResizingEnabled !== 'boolean') {
        continue;
      }
      yield doc;
    }
  }
}

function createWorker() {
  // Adding the event Handler
  function workerMessageHandler(event) {
    let [rgb, uuid] = JSON.parse(event.data);
    for (let doc of getImageDocuments()) {
      if (doc.body.getAttribute("standalone-image-backgrounds-uuid") == uuid) {
        doc.body.style.background = rgb;
        return;
      }
    }
  }
  if (!worker) {
    // Creating resource reference to run the worker file
    const resourceHandler = Services.io.getProtocolHandler('resource')
                              .QueryInterface(Ci.nsIResProtocolHandler);
    const uuidgen = Cc["@mozilla.org/uuid-generator;1"]
                      .getService(Ci.nsIUUIDGenerator);
    const URI = __SCRIPT_URI_SPEC__.replace(/bootstrap\.js$/, "");
    const alias  = "customstandalonebackgrounds" +
                   uuidgen.generateUUID().toString();
    resourceHandler.setSubstitution(alias, Services.io.newURI(URI + '/',
                                                              null, null));

    // Creating the worker to be used whenever by the addon
    worker = new ChromeWorker("resource://" + alias + "/worker.js");

    worker.addEventListener('message', workerMessageHandler, false);

    unload(function() {
      worker.removeEventListener('message', workerMessageHandler, false);
      worker.terminate();
      worker = null;
      resourceHandler.setSubstitution(alias, null);
    });
  }

}

function startup(data, reason) {
  // Initialize default preferences
  let (branch = Services.prefs.getDefaultBranch("extensions.customStandaloneImageBackgrounds.")) {
    branch.setCharPref("customPresets", "[]");
    branch.setIntPref("selectedPresetIndex", 0);
  };

  backgroundPresets = [DEFAULT_BACKGROUND,
    "white",
    "rgb(128,128,128)",
    ...JSON.parse(Services.prefs.getCharPref(PRESET_PREF))
  ];

  loadStyleSheet();
  createWorker();

  if (reason != 1) {
    for (let doc in getImageDocuments()) {
      applyCustomBackground.observe({document: doc},
                                    'content-document-global-created',
                                    null);
    }
  }

  Services.obs.addObserver(applyCustomBackground,
                           'content-document-global-created',
                           false);
  unload(function() {
    Services.obs.removeObserver(applyCustomBackground,
                                'content-document-global-created',
                                false);
  });
}

function shutdown(data, reason) {
  if (reason != APP_SHUTDOWN) {
    unload();
  }
}

function install() {}

function uninstall() {}