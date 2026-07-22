if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}

(function(){
  var COLORS = ["#1C1A17","#E8543E","#4FBE8E","#2C5FC4","#B7A6E0","#F0AC2B"];
  var COLOR_NAMES = ["Ink black","Tomato red","Mint green","Cobalt blue","Lavender purple","Mustard yellow"];
  var MAX_LAYERS = 5;
  var MAX_LAYERS_ANIM = 3;
  var MAX_FRAMES = 12;
  var ANIM_FRAME_MS = 130; // ~7.7fps for preview / feed loop / replay pacing

  /* ---- mascot (Draw workspace only, Stage 1) ---- */
  var mascotEl = document.getElementById('mascot');
  var mascotTimer = null;
  function setMascot(state){
    if(!mascotEl) return;
    mascotEl.setAttribute('data-state', state);
    mascotEl.classList.remove('pop');
    void mascotEl.offsetWidth; // restart animation
    mascotEl.classList.add('pop');
    if(mascotTimer) clearTimeout(mascotTimer);
    if(state !== 'idle'){
      mascotTimer = setTimeout(function(){ mascotEl.setAttribute('data-state','idle'); }, 1200);
    }
  }

  /* ---- tool caption + brush/eraser toggle (Draw workspace only) ---- */
  var toolCaptionEl = document.getElementById('toolCaption');
  var brushBtn = document.getElementById('brushBtn');
  function setToolCaption(text){ if(toolCaptionEl) toolCaptionEl.textContent = text; }
  function setBrushActive(){
    if(!brushBtn) return;
    brushBtn.classList.add('active'); brushBtn.setAttribute('aria-pressed','true');
    document.getElementById('eraserBtn').classList.remove('active');
    document.getElementById('eraserBtn').setAttribute('aria-pressed','false');
    setToolCaption('Brush — for most drawing');
  }
  function setEraserActive(){
    if(!brushBtn) return;
    brushBtn.classList.remove('active'); brushBtn.setAttribute('aria-pressed','false');
    document.getElementById('eraserBtn').classList.add('active');
    document.getElementById('eraserBtn').setAttribute('aria-pressed','true');
    setToolCaption('Eraser — rubs out strokes on this layer');
  }

  /* ================= shared low-level drawing helpers ================= */

  function drawSeg(targetCtx, w, a, b, color, width, eraser){
    targetCtx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    targetCtx.strokeStyle = color;
    targetCtx.lineWidth = width * (w/300);
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.beginPath();
    targetCtx.moveTo(a.x, a.y);
    targetCtx.lineTo(b.x, b.y);
    targetCtx.stroke();
    targetCtx.globalCompositeOperation = 'source-over';
  }

  function drawDot(targetCtx, w, p, color, width, eraser){
    targetCtx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    targetCtx.fillStyle = color;
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, (width*(w/300))/2, 0, Math.PI*2);
    targetCtx.fill();
    targetCtx.globalCompositeOperation = 'source-over';
  }

  function replayStrokesOnto(targetCtx, w, strokes){
    strokes.forEach(function(s){
      for(var i=1;i<s.points.length;i++){
        drawSeg(targetCtx, w, s.points[i-1], s.points[i], s.color, s.width, s.eraser);
      }
      if(s.points.length===1){
        drawDot(targetCtx, w, s.points[0], s.color, s.width, s.eraser);
      }
    });
  }

  function pointerTypeLabel(t){
    if(t==='touch') return 'drawn with finger';
    if(t==='pen') return 'drawn with stylus';
    return 'drawn with mouse';
  }

  function cloneStrokes(strokes){
    return strokes.map(function(s){
      return { color:s.color, width:s.width, eraser:s.eraser, pointerType:s.pointerType,
        points: s.points.map(function(p){ return {x:p.x,y:p.y,t:p.t}; }) };
    });
  }

  /* ================= DRAW MODE (layers) ================= */

  var canvas = document.getElementById('drawCanvas');
  var ctx = canvas.getContext('2d');
  var swatchesEl = document.getElementById('swatches');
  var colorWheel = document.getElementById('colorWheel');
  var sizeSlider = document.getElementById('sizeSlider');
  var eraserBtn = document.getElementById('eraserBtn');
  var undoBtn = document.getElementById('undoBtn');
  var clearBtn = document.getElementById('clearBtn');
  var postBtn = document.getElementById('postBtn');
  var backBtn = document.getElementById('backBtn');
  var layersToggleBtn = document.getElementById('layersToggleBtn');
  var layersPanel = document.getElementById('layersPanel');
  var layersListEl = document.getElementById('layersList');
  var addLayerBtn = document.getElementById('addLayerBtn');

  var currentColor = COLORS[0];
  var isEraser = false;
  var activeStroke = null;
  var isDrawing = false;
  var layerCounter = 0;

  function makeLayer(name){
    layerCounter++;
    var off = document.createElement('canvas');
    off.width = canvas.width; off.height = canvas.height;
    return {
      id: 'layer'+layerCounter,
      name: name || ('Layer ' + layerCounter),
      visible: true,
      bgColor: null,
      strokes: [],
      canvasEl: off,
      ctx: off.getContext('2d')
    };
  }

  var layers = [ makeLayer('Layer 1') ];
  var activeLayerIndex = 0;

  function activeLayer(){ return layers[activeLayerIndex]; }

  function fitCanvas(){
    var rect = canvas.getBoundingClientRect();
    var w = rect.width * 2, h = rect.height * 2;
    canvas.width = w; canvas.height = h;
    layers.forEach(function(layer){
      layer.canvasEl.width = w; layer.canvasEl.height = h;
      renderLayer(layer);
    });
    compositeAll();
  }

  function toLocal(canvasEl, e){
    var rect = canvasEl.getBoundingClientRect();
    var scaleX = canvasEl.width / rect.width;
    var scaleY = canvasEl.height / rect.height;
    return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY, t: performance.now() };
  }

  function renderLayer(layer){
    var lctx = layer.ctx, w = layer.canvasEl.width, h = layer.canvasEl.height;
    lctx.clearRect(0,0,w,h);
    if(layer.bgColor){
      lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = layer.bgColor;
      lctx.fillRect(0,0,w,h);
    }
    replayStrokesOnto(lctx, w, layer.strokes);
  }

  function compositeAll(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    layers.forEach(function(layer){
      if(!layer.visible) return;
      ctx.drawImage(layer.canvasEl, 0, 0);
    });
  }

  canvas.addEventListener('pointerdown', function(e){
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    isDrawing = true;
    var p = toLocal(canvas, e);
    activeStroke = {
      color: isEraser ? '#ffffff' : currentColor,
      width: parseInt(sizeSlider.value,10),
      eraser: isEraser,
      pointerType: e.pointerType || 'mouse',
      points: [p]
    };
  });
  canvas.addEventListener('pointermove', function(e){
    if(!isDrawing) return;
    var layer = activeLayer();
    var p = toLocal(canvas, e);
    var last = activeStroke.points[activeStroke.points.length-1];
    activeStroke.points.push(p);
    drawSeg(layer.ctx, layer.canvasEl.width, last, p, activeStroke.color, activeStroke.width, activeStroke.eraser);
    compositeAll();
  });
  function endStroke(e){
    if(!isDrawing) return;
    isDrawing = false;
    var layer = activeLayer();
    if(activeStroke && activeStroke.points.length===1){
      drawDot(layer.ctx, layer.canvasEl.width, activeStroke.points[0], activeStroke.color, activeStroke.width, activeStroke.eraser);
      compositeAll();
    }
    if(activeStroke) layer.strokes.push(activeStroke);
    activeStroke = null;
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', function(e){ if(e.buttons===0) endStroke(e); });

  function clearSwatchSelection(container){
    Array.prototype.forEach.call(container.children, function(el){ el.classList.remove('selected'); });
  }
  COLORS.forEach(function(c, i){
    var b = document.createElement('button');
    b.className = 'swatch' + (i===0?' selected':'');
    b.style.background = c;
    b.setAttribute('aria-label', COLOR_NAMES[i] || c);
    b.addEventListener('click', function(){
      currentColor = c; isEraser = false;
      setBrushActive();
      clearSwatchSelection(swatchesEl);
      b.classList.add('selected');
      setMascot('happy');
    });
    swatchesEl.appendChild(b);
  });
  colorWheel.addEventListener('input', function(){
    currentColor = colorWheel.value;
    isEraser = false;
    setBrushActive();
    clearSwatchSelection(swatchesEl);
    setMascot('happy');
  });

  if(brushBtn){
    brushBtn.addEventListener('click', function(){
      isEraser = false;
      setBrushActive();
    });
  }
  eraserBtn.addEventListener('click', function(){
    isEraser = true;
    setEraserActive();
  });
  undoBtn.addEventListener('click', function(){
    var layer = activeLayer();
    layer.strokes.pop();
    renderLayer(layer);
    compositeAll();
  });
  clearBtn.addEventListener('click', function(){
    var layer = activeLayer();
    layer.strokes = [];
    renderLayer(layer);
    compositeAll();
    setMascot('alarmed');
  });

  layersToggleBtn.addEventListener('click', function(){
    var isOpen = layersPanel.classList.toggle('open');
    layersToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  function renderLayersPanel(){
    layersListEl.innerHTML = '';
    for(var i=layers.length-1; i>=0; i--){
      (function(i){
        var layer = layers[i];
        var row = document.createElement('div');
        row.className = 'layer-row' + (i===activeLayerIndex ? ' active' : '');

        var eyeBtn = document.createElement('button');
        eyeBtn.className = 'eye' + (layer.visible ? '' : ' off');
        eyeBtn.textContent = layer.visible ? '◉' : '○';
        eyeBtn.title = 'Toggle visibility';
        eyeBtn.setAttribute('aria-label', (layer.visible ? 'Hide' : 'Show') + ' ' + layer.name);
        eyeBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          layer.visible = !layer.visible;
          compositeAll();
          renderLayersPanel();
        });

        var bgSwatch = document.createElement('label');
        bgSwatch.className = 'bgswatch';
        bgSwatch.title = 'Set background color for this layer';
        bgSwatch.setAttribute('aria-label', 'Set background color for ' + layer.name);
        bgSwatch.style.background = layer.bgColor ||
          'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)';
        if(layer.bgColor){ bgSwatch.style.backgroundSize = 'auto'; }
        var bgInput = document.createElement('input');
        bgInput.type = 'color';
        bgInput.value = layer.bgColor || '#ffffff';
        bgInput.addEventListener('click', function(ev){ ev.stopPropagation(); });
        bgInput.addEventListener('input', function(){
          layer.bgColor = bgInput.value;
          renderLayer(layer);
          compositeAll();
          renderLayersPanel();
        });
        bgSwatch.appendChild(bgInput);

        var nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = layer.name + (layer.bgColor ? ' · bg' : '');

        var upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.title = 'Move up';
        upBtn.setAttribute('aria-label', 'Move ' + layer.name + ' up');
        upBtn.disabled = i === layers.length-1;
        upBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(i < layers.length-1){
            var tmp = layers[i]; layers[i] = layers[i+1]; layers[i+1] = tmp;
            if(activeLayerIndex===i) activeLayerIndex=i+1;
            else if(activeLayerIndex===i+1) activeLayerIndex=i;
            compositeAll(); renderLayersPanel();
          }
        });

        var downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.title = 'Move down';
        downBtn.setAttribute('aria-label', 'Move ' + layer.name + ' down');
        downBtn.disabled = i === 0;
        downBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(i > 0){
            var tmp = layers[i]; layers[i] = layers[i-1]; layers[i-1] = tmp;
            if(activeLayerIndex===i) activeLayerIndex=i-1;
            else if(activeLayerIndex===i-1) activeLayerIndex=i;
            compositeAll(); renderLayersPanel();
          }
        });

        var delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = 'Delete layer';
        delBtn.setAttribute('aria-label', 'Delete ' + layer.name);
        delBtn.disabled = layers.length <= 1;
        delBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(layers.length <= 1) return;
          layers.splice(i,1);
          if(activeLayerIndex >= layers.length) activeLayerIndex = layers.length-1;
          compositeAll(); renderLayersPanel();
        });

        row.appendChild(eyeBtn);
        row.appendChild(bgSwatch);
        row.appendChild(nameEl);
        row.appendChild(upBtn);
        row.appendChild(downBtn);
        row.appendChild(delBtn);

        row.addEventListener('click', function(){
          activeLayerIndex = i;
          renderLayersPanel();
        });

        layersListEl.appendChild(row);
      })(i);
    }
    addLayerBtn.disabled = layers.length >= MAX_LAYERS;
    addLayerBtn.textContent = layers.length >= MAX_LAYERS ? ('Max ' + MAX_LAYERS + ' layers') : '+ Add layer';
  }

  addLayerBtn.addEventListener('click', function(){
    if(layers.length >= MAX_LAYERS) return;
    var newLayer = makeLayer();
    layers.push(newLayer);
    activeLayerIndex = layers.length-1;
    compositeAll();
    renderLayersPanel();
  });

  function resetLayersForNewDrawing(){
    layers = [ makeLayer('Layer 1') ];
    activeLayerIndex = 0;
    layers.forEach(function(l){ l.canvasEl.width = canvas.width; l.canvasEl.height = canvas.height; });
    compositeAll();
    renderLayersPanel();
  }

  /* ================= ANIMATE MODE (onion-skin frames) ================= */

  var animCanvas = document.getElementById('animateCanvas');
  var actx = animCanvas.getContext('2d');
  var swatchesAnimEl = document.getElementById('swatchesAnim');
  var colorWheelAnim = document.getElementById('colorWheelAnim');
  var sizeSliderAnim = document.getElementById('sizeSliderAnim');
  var eraserBtnAnim = document.getElementById('eraserBtnAnim');
  var undoBtnAnim = document.getElementById('undoBtnAnim');
  var clearBtnAnim = document.getElementById('clearBtnAnim');
  var deleteFrameBtn = document.getElementById('deleteFrameBtn');
  var onionToggleBtn = document.getElementById('onionToggleBtn');
  var previewBtn = document.getElementById('previewBtn');
  var newFrameModeBtn = document.getElementById('newFrameModeBtn');
  var animHintEl = document.getElementById('animHint');
  var postBtnAnim = document.getElementById('postBtnAnim');
  var backBtnAnim = document.getElementById('backBtnAnim');
  var frameStripEl = document.getElementById('frameStrip');
  var layersToggleBtnAnim = document.getElementById('layersToggleBtnAnim');
  var layersPanelAnim = document.getElementById('layersPanelAnim');
  var layersListAnim = document.getElementById('layersListAnim');
  var addLayerBtnAnim = document.getElementById('addLayerBtnAnim');

  var animColor = COLORS[0];
  var animEraser = false;
  var animActiveStroke = null;
  var animIsDrawing = false;
  var onionEnabled = true;
  var previewPlaying = false;
  var previewTimer = null;
  var newFrameMode = 'copy'; // 'copy' = duplicate last frame, 'blank' = start empty and trace the onion-skin ghost
  var animLayerCounter = 0;

  function makeAnimLayer(name){
    animLayerCounter++;
    var off = document.createElement('canvas');
    off.width = animCanvas.width; off.height = animCanvas.height;
    return {
      id: 'animLayer'+animLayerCounter,
      name: name || ('Layer ' + animLayerCounter),
      visible: true,
      bgColor: null,
      strokes: [],
      canvasEl: off,
      ctx: off.getContext('2d')
    };
  }

  function renderAnimLayer(layer){
    var lctx = layer.ctx, w = layer.canvasEl.width, h = layer.canvasEl.height;
    lctx.clearRect(0,0,w,h);
    if(layer.bgColor){
      lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = layer.bgColor;
      lctx.fillRect(0,0,w,h);
    }
    replayStrokesOnto(lctx, w, layer.strokes);
  }

  // Combines a frame's visible layers into its own bitmap — used both for the
  // onion-skin ghost of the previous frame and for the frame-strip thumbnails.
  function compositeFrame(frame){
    var w = frame.canvasEl.width, h = frame.canvasEl.height;
    frame.ctx.clearRect(0,0,w,h);
    frame.layers.forEach(function(layer){
      if(!layer.visible) return;
      frame.ctx.drawImage(layer.canvasEl, 0, 0);
    });
  }

  // copyFromFrame: another frame to base the new one on (layer structure + content).
  // blankStrokes: when copying, keep each layer's background color but drop its
  // drawn strokes — used by "Blank (trace)" new-frame mode.
  function makeFrame(copyFromFrame, blankStrokes){
    var compositeEl = document.createElement('canvas');
    compositeEl.width = animCanvas.width; compositeEl.height = animCanvas.height;
    var layers;
    if(copyFromFrame){
      layers = copyFromFrame.layers.map(function(l){
        var nl = makeAnimLayer(l.name);
        nl.bgColor = l.bgColor;
        nl.visible = l.visible;
        nl.strokes = blankStrokes ? [] : cloneStrokes(l.strokes);
        renderAnimLayer(nl);
        return nl;
      });
    } else {
      layers = [ makeAnimLayer('Layer 1') ];
    }
    var frame = {
      layers: layers,
      activeLayerIndex: 0,
      canvasEl: compositeEl,
      ctx: compositeEl.getContext('2d')
    };
    compositeFrame(frame);
    return frame;
  }

  var frames = [ makeFrame() ];
  var activeFrameIndex = 0;

  function activeFrame(){ return frames[activeFrameIndex]; }
  function activeAnimLayer(){ var f = activeFrame(); return f.layers[f.activeLayerIndex]; }

  function composeAnimCanvas(){
    actx.clearRect(0,0,animCanvas.width,animCanvas.height);
    if(onionEnabled && activeFrameIndex > 0){
      actx.globalAlpha = 0.28;
      actx.drawImage(frames[activeFrameIndex-1].canvasEl, 0, 0);
      actx.globalAlpha = 1;
    }
    actx.drawImage(activeFrame().canvasEl, 0, 0);
  }

  function fitAnimCanvas(){
    var rect = animCanvas.getBoundingClientRect();
    var w = rect.width * 2, h = rect.height * 2;
    animCanvas.width = w; animCanvas.height = h;
    frames.forEach(function(f){
      f.canvasEl.width = w; f.canvasEl.height = h;
      f.layers.forEach(function(l){
        l.canvasEl.width = w; l.canvasEl.height = h;
        renderAnimLayer(l);
      });
      compositeFrame(f);
    });
    composeAnimCanvas();
  }

  animCanvas.addEventListener('pointerdown', function(e){
    e.preventDefault();
    if(previewPlaying){ stopPreview(); }
    animCanvas.setPointerCapture(e.pointerId);
    animIsDrawing = true;
    var p = toLocal(animCanvas, e);
    animActiveStroke = {
      color: animEraser ? '#ffffff' : animColor,
      width: parseInt(sizeSliderAnim.value,10),
      eraser: animEraser,
      pointerType: e.pointerType || 'mouse',
      points: [p]
    };
  });
  animCanvas.addEventListener('pointermove', function(e){
    if(!animIsDrawing) return;
    var layer = activeAnimLayer();
    var p = toLocal(animCanvas, e);
    var last = animActiveStroke.points[animActiveStroke.points.length-1];
    animActiveStroke.points.push(p);
    drawSeg(layer.ctx, layer.canvasEl.width, last, p, animActiveStroke.color, animActiveStroke.width, animActiveStroke.eraser);
    compositeFrame(activeFrame());
    composeAnimCanvas();
  });
  function endAnimStroke(){
    if(!animIsDrawing) return;
    animIsDrawing = false;
    var layer = activeAnimLayer();
    if(animActiveStroke && animActiveStroke.points.length===1){
      drawDot(layer.ctx, layer.canvasEl.width, animActiveStroke.points[0], animActiveStroke.color, animActiveStroke.width, animActiveStroke.eraser);
      compositeFrame(activeFrame());
      composeAnimCanvas();
    }
    if(animActiveStroke) layer.strokes.push(animActiveStroke);
    animActiveStroke = null;
    renderFrameStrip();
  }
  animCanvas.addEventListener('pointerup', endAnimStroke);
  animCanvas.addEventListener('pointercancel', endAnimStroke);
  animCanvas.addEventListener('pointerleave', function(e){ if(e.buttons===0) endAnimStroke(); });

  COLORS.forEach(function(c, i){
    var b = document.createElement('button');
    b.className = 'swatch' + (i===0?' selected':'');
    b.style.background = c;
    b.addEventListener('click', function(){
      animColor = c; animEraser = false;
      eraserBtnAnim.classList.remove('active');
      clearSwatchSelection(swatchesAnimEl);
      b.classList.add('selected');
    });
    swatchesAnimEl.appendChild(b);
  });
  colorWheelAnim.addEventListener('input', function(){
    animColor = colorWheelAnim.value;
    animEraser = false;
    eraserBtnAnim.classList.remove('active');
    clearSwatchSelection(swatchesAnimEl);
  });

  eraserBtnAnim.addEventListener('click', function(){
    animEraser = !animEraser;
    eraserBtnAnim.classList.toggle('active', animEraser);
  });
  undoBtnAnim.addEventListener('click', function(){
    var layer = activeAnimLayer();
    layer.strokes.pop();
    renderAnimLayer(layer);
    compositeFrame(activeFrame());
    composeAnimCanvas();
    renderFrameStrip();
  });
  clearBtnAnim.addEventListener('click', function(){
    var layer = activeAnimLayer();
    layer.strokes = [];
    renderAnimLayer(layer);
    compositeFrame(activeFrame());
    composeAnimCanvas();
    renderFrameStrip();
  });
  deleteFrameBtn.addEventListener('click', function(){
    if(frames.length <= 1) return;
    frames.splice(activeFrameIndex, 1);
    if(activeFrameIndex >= frames.length) activeFrameIndex = frames.length-1;
    composeAnimCanvas();
    renderFrameStrip();
    renderLayersPanelAnim();
  });
  onionToggleBtn.addEventListener('click', function(){
    onionEnabled = !onionEnabled;
    onionToggleBtn.classList.toggle('active', onionEnabled);
    composeAnimCanvas();
  });
  onionToggleBtn.classList.add('active');

  newFrameModeBtn.addEventListener('click', function(){
    newFrameMode = newFrameMode === 'copy' ? 'blank' : 'copy';
    var isBlank = newFrameMode === 'blank';
    newFrameModeBtn.classList.toggle('active', isBlank);
    newFrameModeBtn.setAttribute('aria-pressed', isBlank ? 'true' : 'false');
    newFrameModeBtn.textContent = isBlank ? '+ Blank (trace onion skin)' : '+ Copy last frame';
    if(animHintEl){
      animHintEl.textContent = isBlank
        ? 'Trace mode: each new frame keeps layer backgrounds but starts blank on top — the faded onion skin behind it is your last frame to draw over.'
        : 'Copy mode: each new frame starts as the last one — tweak it a little, add a frame, repeat.';
    }
    if(isBlank && !onionEnabled){
      onionEnabled = true;
      onionToggleBtn.classList.add('active');
      composeAnimCanvas();
    }
  });

  /* ---- per-frame layers panel (up to 3 layers per frame) ---- */
  layersToggleBtnAnim.addEventListener('click', function(){
    var isOpen = layersPanelAnim.classList.toggle('open');
    layersToggleBtnAnim.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  function renderLayersPanelAnim(){
    var frame = activeFrame();
    layersListAnim.innerHTML = '';
    for(var i=frame.layers.length-1; i>=0; i--){
      (function(i){
        var layer = frame.layers[i];
        var row = document.createElement('div');
        row.className = 'layer-row' + (i===frame.activeLayerIndex ? ' active' : '');

        var eyeBtn = document.createElement('button');
        eyeBtn.className = 'eye' + (layer.visible ? '' : ' off');
        eyeBtn.textContent = layer.visible ? '◉' : '○';
        eyeBtn.title = 'Toggle visibility';
        eyeBtn.setAttribute('aria-label', (layer.visible ? 'Hide' : 'Show') + ' ' + layer.name);
        eyeBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          layer.visible = !layer.visible;
          compositeFrame(frame); composeAnimCanvas(); renderFrameStrip(); renderLayersPanelAnim();
        });

        var bgSwatch = document.createElement('label');
        bgSwatch.className = 'bgswatch';
        bgSwatch.title = 'Set background color for this layer';
        bgSwatch.setAttribute('aria-label', 'Set background color for ' + layer.name);
        bgSwatch.style.background = layer.bgColor ||
          'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)';
        if(layer.bgColor){ bgSwatch.style.backgroundSize = 'auto'; }
        var bgInput = document.createElement('input');
        bgInput.type = 'color';
        bgInput.value = layer.bgColor || '#ffffff';
        bgInput.addEventListener('click', function(ev){ ev.stopPropagation(); });
        bgInput.addEventListener('input', function(){
          layer.bgColor = bgInput.value;
          renderAnimLayer(layer);
          compositeFrame(frame); composeAnimCanvas(); renderFrameStrip(); renderLayersPanelAnim();
        });
        bgSwatch.appendChild(bgInput);

        var nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = layer.name + (layer.bgColor ? ' · bg' : '');

        var upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.title = 'Move up';
        upBtn.setAttribute('aria-label', 'Move ' + layer.name + ' up');
        upBtn.disabled = i === frame.layers.length-1;
        upBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(i < frame.layers.length-1){
            var tmp = frame.layers[i]; frame.layers[i] = frame.layers[i+1]; frame.layers[i+1] = tmp;
            if(frame.activeLayerIndex===i) frame.activeLayerIndex=i+1;
            else if(frame.activeLayerIndex===i+1) frame.activeLayerIndex=i;
            compositeFrame(frame); composeAnimCanvas(); renderFrameStrip(); renderLayersPanelAnim();
          }
        });

        var downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.title = 'Move down';
        downBtn.setAttribute('aria-label', 'Move ' + layer.name + ' down');
        downBtn.disabled = i === 0;
        downBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(i > 0){
            var tmp = frame.layers[i]; frame.layers[i] = frame.layers[i-1]; frame.layers[i-1] = tmp;
            if(frame.activeLayerIndex===i) frame.activeLayerIndex=i-1;
            else if(frame.activeLayerIndex===i-1) frame.activeLayerIndex=i;
            compositeFrame(frame); composeAnimCanvas(); renderFrameStrip(); renderLayersPanelAnim();
          }
        });

        var delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = 'Delete layer';
        delBtn.setAttribute('aria-label', 'Delete ' + layer.name);
        delBtn.disabled = frame.layers.length <= 1;
        delBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(frame.layers.length <= 1) return;
          frame.layers.splice(i,1);
          if(frame.activeLayerIndex >= frame.layers.length) frame.activeLayerIndex = frame.layers.length-1;
          compositeFrame(frame); composeAnimCanvas(); renderFrameStrip(); renderLayersPanelAnim();
        });

        row.appendChild(eyeBtn);
        row.appendChild(bgSwatch);
        row.appendChild(nameEl);
        row.appendChild(upBtn);
        row.appendChild(downBtn);
        row.appendChild(delBtn);

        row.addEventListener('click', function(){
          frame.activeLayerIndex = i;
          renderLayersPanelAnim();
        });

        layersListAnim.appendChild(row);
      })(i);
    }
    addLayerBtnAnim.disabled = frame.layers.length >= MAX_LAYERS_ANIM;
    addLayerBtnAnim.textContent = frame.layers.length >= MAX_LAYERS_ANIM ? ('Max ' + MAX_LAYERS_ANIM + ' layers') : '+ Add layer';
  }

  addLayerBtnAnim.addEventListener('click', function(){
    var frame = activeFrame();
    if(frame.layers.length >= MAX_LAYERS_ANIM) return;
    var newLayer = makeAnimLayer();
    frame.layers.push(newLayer);
    frame.activeLayerIndex = frame.layers.length-1;
    compositeFrame(frame); composeAnimCanvas(); renderFrameStrip(); renderLayersPanelAnim();
  });

  function renderFrameStrip(){
    frameStripEl.innerHTML = '';
    frames.forEach(function(frame, i){
      var thumb = document.createElement('div');
      thumb.className = 'frame-thumb' + (i===activeFrameIndex ? ' active' : '');
      var img = document.createElement('img');
      img.src = frame.canvasEl.toDataURL('image/png');
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = (i+1);
      thumb.appendChild(img);
      thumb.appendChild(num);
      thumb.addEventListener('click', function(){
        stopPreview();
        activeFrameIndex = i;
        composeAnimCanvas();
        renderFrameStrip();
        renderLayersPanelAnim();
      });
      frameStripEl.appendChild(thumb);
    });
    var addBtn = document.createElement('button');
    addBtn.className = 'frame-add';
    addBtn.textContent = '+';
    addBtn.title = 'Add frame (copies the current one)';
    addBtn.disabled = frames.length >= MAX_FRAMES;
    addBtn.addEventListener('click', function(){
      if(frames.length >= MAX_FRAMES) return;
      var newFrame = newFrameMode === 'blank' ? makeFrame(activeFrame(), true) : makeFrame(activeFrame(), false);
      frames.splice(activeFrameIndex+1, 0, newFrame);
      activeFrameIndex++;
      composeAnimCanvas();
      renderFrameStrip();
      renderLayersPanelAnim();
    });
    frameStripEl.appendChild(addBtn);
  }

  function stopPreview(){
    if(previewTimer){ clearInterval(previewTimer); previewTimer = null; }
    previewPlaying = false;
    previewBtn.textContent = '▶ Preview';
    composeAnimCanvas();
  }
  previewBtn.addEventListener('click', function(){
    if(previewPlaying){ stopPreview(); return; }
    if(frames.length < 2) return;
    previewPlaying = true;
    previewBtn.textContent = '■ Stop';
    var i = 0;
    previewTimer = setInterval(function(){
      actx.clearRect(0,0,animCanvas.width,animCanvas.height);
      actx.drawImage(frames[i].canvasEl, 0, 0);
      i = (i+1) % frames.length;
    }, ANIM_FRAME_MS);
  });

  function resetFramesForNewAnimation(){
    stopPreview();
    frames = [ makeFrame() ];
    activeFrameIndex = 0;
    composeAnimCanvas();
    renderFrameStrip();
    renderLayersPanelAnim();
  }

  /* ================= posts / feed ================= */
  var posts = [];
  try{ posts = JSON.parse(localStorage.getItem('dood_posts')||'[]'); }catch(e){ posts=[]; }
  var feedAnimTimers = [];

  function relTime(iso){
    var diff = Date.now() - new Date(iso).getTime();
    var m = Math.floor(diff/60000);
    if(m<1) return 'just now';
    if(m<60) return m+'m ago';
    var h = Math.floor(m/60);
    if(h<24) return h+'h ago';
    return Math.floor(h/24)+'d ago';
  }

  function clearFeedAnimTimers(){
    feedAnimTimers.forEach(function(t){ clearInterval(t); });
    feedAnimTimers = [];
  }

  function renderFeed(){
    clearFeedAnimTimers();
    var list = document.getElementById('feedList');
    list.innerHTML = '';
    if(posts.length===0){
      list.innerHTML = '<div class="empty">No posts yet — tap "+ New" and make something.</div>';
      return;
    }
    posts.forEach(function(post){
      var card = document.createElement('div');
      card.className = 'post';
      var loopBadge = post.type==='animate' ? '<span class="tag" style="margin-left:6px;background:var(--teal-light);color:var(--teal-dark);">loop</span>' : '';
      card.innerHTML =
        '<div class="post-head">'+
          '<div class="avatar">'+(post.author||'YOU').slice(0,2)+'</div>'+
          '<div class="name">'+(post.authorName||'you')+'</div>'+
          '<div class="tag">'+post.deviceLabel+'</div>'+ loopBadge +
        '</div>'+
        '<div class="thumb-wrap"><img class="thumb-img" src="'+(post.type==='animate' ? post.frameImages[0] : post.thumb)+'" alt="drawing"></div>'+
        '<div class="post-actions">'+
          '<button class="replay-btn" data-id="'+post.id+'">&#9654; Replay</button>'+
          '<span>&#9825; '+post.likes+'</span>'+
          '<span class="time">'+relTime(post.createdAt)+'</span>'+
        '</div>';
      list.appendChild(card);

      if(post.type==='animate' && post.frameImages && post.frameImages.length>1){
        var imgEl = card.querySelector('.thumb-img');
        var fi = 0;
        var timer = setInterval(function(){
          fi = (fi+1) % post.frameImages.length;
          imgEl.src = post.frameImages[fi];
        }, ANIM_FRAME_MS);
        feedAnimTimers.push(timer);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.replay-btn'), function(btn){
      btn.addEventListener('click', function(){ openReplay(btn.getAttribute('data-id')); });
    });
  }

  function savePosts(){
    try{ localStorage.setItem('dood_posts', JSON.stringify(posts)); }catch(e){}
  }

  postBtn.addEventListener('click', function(){
    var hasAnyStroke = layers.some(function(l){ return l.strokes.length>0; });
    if(!hasAnyStroke){ setMascot('confused'); return; }
    var majority = {};
    layers.forEach(function(l){
      l.strokes.forEach(function(s){ majority[s.pointerType] = (majority[s.pointerType]||0)+1; });
    });
    var bestType = Object.keys(majority).sort(function(a,b){return majority[b]-majority[a];})[0];
    var layersSnapshot = layers.filter(function(l){ return l.visible; }).map(function(l){
      return { bgColor: l.bgColor, strokes: l.strokes };
    });
    var post = {
      id: 'p'+Date.now(),
      type: 'draw',
      author: 'ME',
      authorName: 'you',
      deviceLabel: pointerTypeLabel(bestType),
      layers: layersSnapshot,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      thumb: canvas.toDataURL('image/png'),
      createdAt: new Date().toISOString(),
      likes: 0
    };
    posts.unshift(post);
    savePosts();
    resetLayersForNewDrawing();
    renderFeed();
    switchTab('feed');
  });

  backBtn.addEventListener('click', function(){
    resetLayersForNewDrawing();
    switchTab('feed');
  });

  postBtnAnim.addEventListener('click', function(){
    var hasAnyStroke = frames.some(function(f){ return f.layers.some(function(l){ return l.strokes.length>0; }); });
    if(!hasAnyStroke){ return; }
    stopPreview();
    var majority = {};
    frames.forEach(function(f){
      f.layers.forEach(function(l){
        l.strokes.forEach(function(s){ majority[s.pointerType] = (majority[s.pointerType]||0)+1; });
      });
    });
    var bestType = Object.keys(majority).sort(function(a,b){return majority[b]-majority[a];})[0] || 'mouse';
    var frameImages = frames.map(function(f){ return f.canvasEl.toDataURL('image/png'); });
    var frameLayers = frames.map(function(f){
      return { layers: f.layers.filter(function(l){ return l.visible; }).map(function(l){ return { bgColor: l.bgColor, strokes: l.strokes }; }) };
    });
    var post = {
      id: 'p'+Date.now(),
      type: 'animate',
      author: 'ME',
      authorName: 'you',
      deviceLabel: pointerTypeLabel(bestType),
      frames: frameLayers,
      frameImages: frameImages,
      canvasWidth: animCanvas.width,
      canvasHeight: animCanvas.height,
      thumb: frameImages[0],
      createdAt: new Date().toISOString(),
      likes: 0
    };
    posts.unshift(post);
    savePosts();
    resetFramesForNewAnimation();
    renderFeed();
    switchTab('feed');
  });

  backBtnAnim.addEventListener('click', function(){
    resetFramesForNewAnimation();
    switchTab('feed');
  });

  /* ================= replay ================= */
  var replayModal = document.getElementById('replayModal');
  var replayCanvas = document.getElementById('replayCanvas');
  var replayCtx = replayCanvas.getContext('2d');
  var replayTag = document.getElementById('replayTag');
  var currentReplayPost = null;
  var replayTimers = [];

  function clearReplayTimers(){
    replayTimers.forEach(function(t){ clearTimeout(t); clearInterval(t); });
    replayTimers = [];
  }

  function openReplay(id){
    currentReplayPost = posts.filter(function(p){ return p.id===id; })[0];
    if(!currentReplayPost) return;
    replayCanvas.width = currentReplayPost.canvasWidth || 600;
    replayCanvas.height = currentReplayPost.canvasHeight || 338;
    replayTag.textContent = currentReplayPost.deviceLabel;
    replayModal.classList.add('open');
    if(currentReplayPost.type==='animate'){
      playAnimateReplay();
    } else {
      playDrawReplay();
    }
  }

  function playDrawReplay(){
    clearReplayTimers();
    replayCtx.clearRect(0,0,replayCanvas.width,replayCanvas.height);

    var layersSnap = currentReplayPost.layers ||
      [{ bgColor: null, strokes: currentReplayPost.strokes || [] }]; // backward-compat

    layersSnap.forEach(function(l){
      if(l.bgColor){
        replayCtx.globalCompositeOperation = 'source-over';
        replayCtx.fillStyle = l.bgColor;
        replayCtx.fillRect(0,0,replayCanvas.width,replayCanvas.height);
      }
    });

    var allStrokes = [];
    layersSnap.forEach(function(l){ l.strokes.forEach(function(s){ allStrokes.push(s); }); });
    allStrokes.sort(function(a,b){
      var ta = a.points[0] ? a.points[0].t : 0;
      var tb = b.points[0] ? b.points[0].t : 0;
      return ta - tb;
    });

    var elapsed = 0;
    allStrokes.forEach(function(s, si){
      elapsed += si===0 ? 0 : 60;
      for(var i=1;i<s.points.length;i++){
        var a = s.points[i-1], b = s.points[i];
        var delay = Math.min(Math.max(b.t - a.t, 4), 40);
        elapsed += delay;
        (function(a,b,color,width,eraser,when){
          replayTimers.push(setTimeout(function(){
            drawSeg(replayCtx, replayCanvas.width, a, b, color, width, eraser);
          }, when));
        })(a,b,s.color,s.width,s.eraser,elapsed);
      }
      if(s.points.length===1){
        elapsed += 30;
        (function(p,color,width,eraser,when){
          replayTimers.push(setTimeout(function(){
            drawDot(replayCtx, replayCanvas.width, p, color, width, eraser);
          }, when));
        })(s.points[0], s.color, s.width, s.eraser, elapsed);
      }
    });
  }

  // Animate replay: reveal each frame stroke-by-stroke in order (a little construction
  // montage), then settle into looping the finished frames continuously.
  // Each frame may have multiple layers (new format: {layers:[{bgColor,strokes}]});
  // older saved posts have a flat {strokes:[...]} per frame — handled as a single layer.
  function playAnimateReplay(){
    clearReplayTimers();
    replayCtx.clearRect(0,0,replayCanvas.width,replayCanvas.height);
    var w = replayCanvas.width, h = replayCanvas.height;
    var frameList = currentReplayPost.frames || [];
    var elapsed = 0;

    function layersOf(frame){ return frame.layers || [{ bgColor:null, strokes: frame.strokes || [] }]; }

    frameList.forEach(function(frame, fi){
      if(fi > 0){
        elapsed += 400; // hold the finished frame briefly before wiping to the next
        (function(when){
          replayTimers.push(setTimeout(function(){
            replayCtx.clearRect(0,0,w,h);
          }, when));
        })(elapsed);
      }
      var layersSnap = layersOf(frame);
      (function(layersSnap, when){
        replayTimers.push(setTimeout(function(){
          layersSnap.forEach(function(l){
            if(l.bgColor){
              replayCtx.globalCompositeOperation = 'source-over';
              replayCtx.fillStyle = l.bgColor;
              replayCtx.fillRect(0,0,w,h);
            }
          });
        }, when));
      })(layersSnap, elapsed);

      var allStrokes = [];
      layersSnap.forEach(function(l){ l.strokes.forEach(function(s){ allStrokes.push(s); }); });
      allStrokes.sort(function(a,b){
        var ta = a.points[0] ? a.points[0].t : 0;
        var tb = b.points[0] ? b.points[0].t : 0;
        return ta - tb;
      });

      allStrokes.forEach(function(s, si){
        elapsed += si===0 ? 0 : 50;
        for(var i=1;i<s.points.length;i++){
          var a = s.points[i-1], b = s.points[i];
          var delay = Math.min(Math.max(b.t - a.t, 4), 35);
          elapsed += delay;
          (function(a,b,color,width,eraser,when){
            replayTimers.push(setTimeout(function(){
              drawSeg(replayCtx, w, a, b, color, width, eraser);
            }, when));
          })(a,b,s.color,s.width,s.eraser,elapsed);
        }
        if(s.points.length===1){
          elapsed += 25;
          (function(p,color,width,eraser,when){
            replayTimers.push(setTimeout(function(){
              drawDot(replayCtx, w, p, color, width, eraser);
            }, when));
          })(s.points[0], s.color, s.width, s.eraser, elapsed);
        }
      });
    });

    // after the construction montage, loop the finished animation continuously
    elapsed += 500;
    (function(when){
      replayTimers.push(setTimeout(function(){
        if(frameList.length < 2){ return; }
        var i = 0;
        var loopTimer = setInterval(function(){
          replayCtx.clearRect(0,0,w,h);
          var layersSnap = layersOf(frameList[i]);
          layersSnap.forEach(function(l){
            if(l.bgColor){
              replayCtx.globalCompositeOperation = 'source-over';
              replayCtx.fillStyle = l.bgColor;
              replayCtx.fillRect(0,0,w,h);
            }
          });
          layersSnap.forEach(function(l){ replayStrokesOnto(replayCtx, w, l.strokes); });
          i = (i+1) % frameList.length;
        }, ANIM_FRAME_MS);
        replayTimers.push(loopTimer);
      }, when));
    })(elapsed);
  }

  document.getElementById('closeReplay').addEventListener('click', function(){
    clearReplayTimers();
    replayModal.classList.remove('open');
  });
  document.getElementById('replayAgain').addEventListener('click', function(){
    if(currentReplayPost.type==='animate'){ playAnimateReplay(); } else { playDrawReplay(); }
  });

  /* ================= tabs / navigation ================= */
  function switchTab(name){
    var views = { feed:'feedView', choice:'choiceView', draw:'drawView', animate:'animateView' };
    Object.keys(views).forEach(function(key){
      document.getElementById(views[key]).classList.toggle('active', key===name);
    });
    document.getElementById('tabFeed').classList.toggle('active', name==='feed');
    document.getElementById('tabNew').classList.toggle('active', name!=='feed');
    if(name==='draw'){ setTimeout(fitCanvas, 0); }
    if(name==='animate'){ setTimeout(fitAnimCanvas, 0); setTimeout(renderFrameStrip, 0); setTimeout(renderLayersPanelAnim, 0); }
  }
  document.getElementById('tabFeed').addEventListener('click', function(){ switchTab('feed'); });
  document.getElementById('tabNew').addEventListener('click', function(){ switchTab('choice'); });
  document.getElementById('choiceDraw').addEventListener('click', function(){ switchTab('draw'); });
  document.getElementById('choiceAnimate').addEventListener('click', function(){ switchTab('animate'); });

  /* ---------- seed example post on first run ---------- */
  function buildSeedPost(){
    var pts1 = [], pts2 = [], pts3 = [], pts4=[];
    var cx=300, cy=169, r=110, t=0;
    for(var a=0;a<=360;a+=8){
      var rad = a*Math.PI/180;
      pts1.push({x:cx+Math.cos(rad)*r, y:cy+Math.sin(rad)*r, t:t}); t+=12;
    }
    pts2.push({x:cx-42,y:cy-25,t:t}); t+=40; pts2.push({x:cx-42,y:cy-8,t:t});
    t+=200;
    pts3.push({x:cx+42,y:cy-25,t:t}); t+=40; pts3.push({x:cx+42,y:cy-8,t:t});
    t+=200;
    for(var a2=200;a2<=340;a2+=6){
      var rad2=a2*Math.PI/180;
      pts4.push({x:cx+Math.cos(rad2)*48, y:cy+30+Math.sin(rad2)*48, t:t}); t+=14;
    }
    var seedStrokes = [
      {color:'#222222', width:8, eraser:false, pointerType:'mouse', points:pts1},
      {color:'#222222', width:10, eraser:false, pointerType:'mouse', points:pts2},
      {color:'#222222', width:10, eraser:false, pointerType:'mouse', points:pts3},
      {color:'#D85A30', width:8, eraser:false, pointerType:'mouse', points:pts4}
    ];
    var off = document.createElement('canvas');
    off.width=600; off.height=338;
    var octx = off.getContext('2d');
    seedStrokes.forEach(function(s){
      for(var i=1;i<s.points.length;i++){
        octx.globalCompositeOperation='source-over';
        octx.strokeStyle=s.color; octx.lineWidth=s.width*2; octx.lineCap='round'; octx.lineJoin='round';
        octx.beginPath(); octx.moveTo(s.points[i-1].x,s.points[i-1].y); octx.lineTo(s.points[i].x,s.points[i].y); octx.stroke();
      }
    });
    return {
      id:'seed1', type:'draw', author:'AK', authorName:'ari.k', deviceLabel:'drawn with stylus',
      layers: [{ bgColor: null, strokes: seedStrokes }],
      canvasWidth: 600, canvasHeight: 338,
      thumb: off.toDataURL('image/png'),
      createdAt: new Date(Date.now()-3600*1000*3).toISOString(), likes: 12
    };
  }

  if(posts.length===0){
    posts.push(buildSeedPost());
    savePosts();
  }

  renderFeed();
  renderLayersPanel();
  renderFrameStrip();
  renderLayersPanelAnim();
  window.addEventListener('resize', function(){
    if(document.getElementById('drawView').classList.contains('active')) fitCanvas();
    if(document.getElementById('animateView').classList.contains('active')) fitAnimCanvas();
  });
})();
