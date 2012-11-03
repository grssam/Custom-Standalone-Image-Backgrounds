let uuidQueue = [], running = false;
self.addEventListener('message', function(e) {
  let data = JSON.parse(e.data);
  uuidQueue.push(data);
  if (!running) {
    processQueue();
  }
}, false);

function getRGB([data, width, height]) {
  function getMatchingGroupIndex(r, g, b) {
    let rgb = [r,g,b];
    if (avg.length == 0) {
      avg[0] = rgb;
      count[0] = 1;
      return;
    }
    else {
      let i = 0;
      for (;i < avg.length; i++) {
        let [aR, aG, aB] = avg[i];
        if (Math.abs(aR - r) < 20 &&
            Math.abs(aG - g) < 20 &&
            Math.abs(aB - b) < 20) {
          avg[i] = avg[i].map(function(x,ii) {
            return (x*count[i] + rgb[ii])/(count[i] + 1);
          });
          count[i]++;
          return;
        }
      }
      // no match, creating a new group
      count[avg.length] = 1;
      avg[avg.length] = rgb;
      return;
    }
  }

  let x, y, ti, count = [], avg = [], xI = (width > height? 3: 2), yI = 5 - xI;;
  for (x = 0; x < width; x+=xI) {
    for (y = 0; y < height; y+=yI) {
      ti = 4*y*width + 4*x;
      getMatchingGroupIndex(data[ti], data[ti+1], data[ti+2]);
    }
  }

  let maxIndex = count.indexOf(Math.max.apply(this, count));
  avg[maxIndex] = avg[maxIndex].map(function(x) Math.round(x));
  return "rgb(" + avg[maxIndex].join(",") + ")";
}

function processQueue() {
  running = true;
  while (uuidQueue.length > 0) {
    let [deletedData] = uuidQueue.splice(0, 1);
    let returnRGB = getRGB(deletedData[0]);
    self.postMessage(JSON.stringify([returnRGB, deletedData[1]]));
  }
  running = false;
}