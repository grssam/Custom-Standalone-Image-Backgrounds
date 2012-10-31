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

let watchingBrowsers = {};

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
  };
  pinDiv.addEventListener("click", onPinClick, false);
  unload(function() {
    pinDiv.removeEventListener("click", onPinClick, false);
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
  let onPresetMouseup = function(event) {
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
      let tempPresets = JSON.parse(Services.prefs.getCharPref(PRESET_PREF));
      if (event.target.hasAttribute("checked")) {
        Services.prefs.setIntPref(INDEX_PREF,
                                  Math.min(aIndex,tempPresets.length + 1));
        aDocument.body.style.background = backgroundPresets[
          Math.min(aIndex + 1,backgroundPresets.length - 2)
        ];
      }
      else if (aIndex <= Services.prefs.getIntPref(INDEX_PREF)) {
        Services.prefs.setIntPref(INDEX_PREF, aIndex - 1);
      }
      tempPresets.splice(aIndex - 3, 1);
      backgroundPresets.splice(aIndex, 1);
      Services.prefs.setCharPref(PRESET_PREF, JSON.stringify(tempPresets));
      presetDiv = null;
      for (let doc in getImagedocuments()) {
        createPane(doc);
        doc.body.style.background = backgroundPresets[
          Services.prefs.getIntPref(INDEX_PREF)
        ];
      }
    }
  };
  presetDiv.addEventListener("mouseup", onPresetMouseup, false);
  unload(function() {
    presetDiv.removeEventListener("mouseup", onPresetMouseup, false);
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
      for (let doc in getImagedocuments()) {
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
}

let applyCustomBackground = {
  observe: function(aSubject, aTopic, aData) {
    let doc = aSubject.document;
    let win = doc.defaultView;
    if (!(doc instanceof win.ImageDocument)) {
      return;
    }

    let img = doc.body.firstChild;
    img.style.background = "none";

    createPane(doc);

    unload(function() {
      try {
        doc.body.style.background = DEFAULT_BACKGROUND;
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
      doc.body.style.background = backgroundPresets[
        Services.prefs.getIntPref(INDEX_PREF)
      ] || DEFAULT_BACKGROUND;

      if (doc.body.style.background == DEFAULT_BACKGROUND &&
          Services.prefs.getIntPref(INDEX_PREF) != 0) {
        Services.prefs.setIntPref(INDEX_PREF, 0);
      }
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

function getImagedocuments() {
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let window = windows.getNext();
    for (let tab of window.gBrowser.tabs) {
      if (tab.hasAttribute("pending")) {
        continue;
      }
      let doc = window.gBrowser.getBrowserForTab(tab).contentDocument;
      if (!(doc instanceof doc.defaultView.ImageDocument)) {
        continue;
      }
      yield doc;
    }
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

  if (reason != 1) {
    for (let doc in getImagedocuments()) {
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