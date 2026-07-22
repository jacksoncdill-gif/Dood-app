if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}

(function(){
  var COLORS = ["#222222","#D85A30","#1D9E75","#378ADD","#7F77DD","#EF9F27"];
  var MAX_LAYERS = 5;

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

  function toLocal(e){
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY, t: performance.now() };
  }

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

  // Fully rebuilds one layer's own offscreen bitmap from its stroke history + bg fill.
  function renderLayer(layer){
    var lctx = layer.ctx, w = layer.canvasEl.width, h = layer.canvasEl.height;
    lctx.clearRect(0,0,w,h);
    if(layer.bgColor){
      lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = layer.bgColor;
      lctx.fillRect(0,0,w,h);
    }
    layer.strokes.forEach(function(s){
      for(var i=1;i<s.points.length;i++){
        drawSeg(lctx, w, s.points[i-1], s.points[i], s.color, s.width, s.eraser);
      }
      if(s.points.length===1){
        drawDot(lctx, w, s.points[0], s.color, s.width, s.eraser);
      }
    });
  }

  // Cheap: just stacks each layer's already-rendered bitmap onto the main visible canvas.
  function compositeAll(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    layers.forEach(function(layer){
      if(!layer.visible) return;
      ctx.drawImage(layer.canvasEl, 0, 0);
    });
  }

  function pointerTypeLabel(t){
    if(t==='touch') return 'drawn with finger';
    if(t==='pen') return 'drawn with stylus';
    return 'drawn with mouse';
  }

  canvas.addEventListener('pointerdown', function(e){
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    isDrawing = true;
    var p = toLocal(e);
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
    var p = toLocal(e);
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

  /* ---------- color controls ---------- */
  function clearSwatchSelection(){
    Array.prototype.forEach.call(swatchesEl.children, function(el){ el.classList.remove('selected'); });
  }
  COLORS.forEach(function(c, i){
    var b = document.createElement('button');
    b.className = 'swatch' + (i===0?' selected':'');
    b.style.background = c;
    b.addEventListener('click', function(){
      currentColor = c; isEraser = false;
      eraserBtn.classList.remove('active');
      clearSwatchSelection();
      b.classList.add('selected');
    });
    swatchesEl.appendChild(b);
  });
  colorWheel.addEventListener('input', function(){
    currentColor = colorWheel.value;
    isEraser = false;
    eraserBtn.classList.remove('active');
    clearSwatchSelection();
  });

  eraserBtn.addEventListener('click', function(){
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active', isEraser);
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
  });

  /* ---------- layers panel ---------- */
  layersToggleBtn.addEventListener('click', function(){
    layersPanel.classList.toggle('open');
  });

  function renderLayersPanel(){
    layersListEl.innerHTML = '';
    // show topmost layer first in the list (matches visual stacking mental model)
    for(var i=layers.length-1; i>=0; i--){
      (function(i){
        var layer = layers[i];
        var row = document.createElement('div');
        row.className = 'layer-row' + (i===activeLayerIndex ? ' active' : '');

        var eyeBtn = document.createElement('button');
        eyeBtn.className = 'eye' + (layer.visible ? '' : ' off');
        eyeBtn.textContent = layer.visible ? '◉' : '○';
        eyeBtn.title = 'Toggle visibility';
        eyeBtn.addEventListener('click', function(ev){
          ev.stopPropagation();
          layer.visible = !layer.visible;
          compositeAll();
          renderLayersPanel();
        });

        var bgSwatch = document.createElement('label');
        bgSwatch.className = 'bgswatch';
        bgSwatch.title = 'Set background color for this layer';
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

  /* ---------- posts / feed ---------- */
  var posts = [];
  try{ posts = JSON.parse(localStorage.getItem('dood_posts')||'[]'); }catch(e){ posts=[]; }

  function relTime(iso){
    var diff = Date.now() - new Date(iso).getTime();
    var m = Math.floor(diff/60000);
    if(m<1) return 'just now';
    if(m<60) return m+'m ago';
    var h = Math.floor(m/60);
    if(h<24) return h+'h ago';
    return Math.floor(h/24)+'d ago';
  }

  function renderFeed(){
    var list = document.getElementById('feedList');
    list.innerHTML = '';
    if(posts.length===0){
      list.innerHTML = '<div class="empty">No posts yet — tap "+ Draw" and make something.</div>';
      return;
    }
    posts.forEach(function(post){
      var card = document.createElement('div');
      card.className = 'post';
      card.innerHTML =
        '<div class="post-head">'+
          '<div class="avatar">'+(post.author||'YOU').slice(0,2)+'</div>'+
          '<div class="name">'+(post.authorName||'you')+'</div>'+
          '<div class="tag">'+post.deviceLabel+'</div>'+
        '</div>'+
        '<div class="thumb-wrap"><img src="'+post.thumb+'" alt="drawing"></div>'+
        '<div class="post-actions">'+
          '<button class="replay-btn" data-id="'+post.id+'">&#9654; Replay</button>'+
          '<span>&#9825; '+post.likes+'</span>'+
          '<span class="time">'+relTime(post.createdAt)+'</span>'+
        '</div>';
      list.appendChild(card);
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
    if(!hasAnyStroke){ return; }
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

  /* ---------- replay ---------- */
  var replayModal = document.getElementById('replayModal');
  var replayCanvas = document.getElementById('replayCanvas');
  var replayCtx = replayCanvas.getContext('2d');
  var replayTag = document.getElementById('replayTag');
  var currentReplayPost = null;
  var replayTimers = [];

  function clearReplayTimers(){
    replayTimers.forEach(function(t){ clearTimeout(t); });
    replayTimers = [];
  }

  function openReplay(id){
    currentReplayPost = posts.filter(function(p){ return p.id===id; })[0];
    if(!currentReplayPost) return;
    replayCanvas.width = currentReplayPost.canvasWidth || 600;
    replayCanvas.height = currentReplayPost.canvasHeight || 600;
    replayTag.textContent = currentReplayPost.deviceLabel;
    replayModal.classList.add('open');
    playReplay();
  }

  function playReplay(){
    clearReplayTimers();
    replayCtx.clearRect(0,0,replayCanvas.width,replayCanvas.height);

    var layersSnap = currentReplayPost.layers ||
      [{ bgColor: null, strokes: currentReplayPost.strokes || [] }]; // backward-compat for old single-layer posts

    // Prebake every layer's background fill immediately (order = bottom to top).
    layersSnap.forEach(function(l){
      if(l.bgColor){
        replayCtx.globalCompositeOperation = 'source-over';
        replayCtx.fillStyle = l.bgColor;
        replayCtx.fillRect(0,0,replayCanvas.width,replayCanvas.height);
      }
    });

    // Merge every layer's strokes into one true chronological queue.
    var allStrokes = [];
    layersSnap.forEach(function(l){
      l.strokes.forEach(function(s){ allStrokes.push(s); });
    });
    allStrokes.sort(function(a,b){
      var ta = a.points[0] ? a.points[0].t : 0;
      var tb = b.points[0] ? b.points[0].t : 0;
      return ta - tb;
    });

    var elapsed = 0;
    allStrokes.forEach(function(s, si){
      elapsed += si===0 ? 0 : 60; // small pause between strokes
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

  document.getElementById('closeReplay').addEventListener('click', function(){
    clearReplayTimers();
    replayModal.classList.remove('open');
  });
  document.getElementById('replayAgain').addEventListener('click', playReplay);

  /* ---------- tabs ---------- */
  function switchTab(name){
    document.getElementById('feedView').classList.toggle('active', name==='feed');
    document.getElementById('drawView').classList.toggle('active', name==='draw');
    document.getElementById('tabFeed').classList.toggle('active', name==='feed');
    document.getElementById('tabDraw').classList.toggle('active', name==='draw');
    if(name==='draw'){ setTimeout(fitCanvas, 0); }
  }
  document.getElementById('tabFeed').addEventListener('click', function(){ switchTab('feed'); });
  document.getElementById('tabDraw').addEventListener('click', function(){ switchTab('draw'); });

  /* ---------- seed example post on first run ---------- */
  function buildSeedPost(){
    var pts1 = [], pts2 = [], pts3 = [], pts4=[];
    var cx=300, cy=300, r=140, t=0;
    for(var a=0;a<=360;a+=8){
      var rad = a*Math.PI/180;
      pts1.push({x:cx+Math.cos(rad)*r, y:cy+Math.sin(rad)*r, t:t}); t+=12;
    }
    pts2.push({x:cx-55,y:cy-30,t:t}); t+=40; pts2.push({x:cx-55,y:cy-10,t:t});
    t+=200;
    pts3.push({x:cx+55,y:cy-30,t:t}); t+=40; pts3.push({x:cx+55,y:cy-10,t:t});
    t+=200;
    for(var a2=200;a2<=340;a2+=6){
      var rad2=a2*Math.PI/180;
      pts4.push({x:cx+Math.cos(rad2)*60, y:cy+40+Math.sin(rad2)*60, t:t}); t+=14;
    }
    var seedStrokes = [
      {color:'#222222', width:8, eraser:false, pointerType:'mouse', points:pts1},
      {color:'#222222', width:10, eraser:false, pointerType:'mouse', points:pts2},
      {color:'#222222', width:10, eraser:false, pointerType:'mouse', points:pts3},
      {color:'#D85A30', width:8, eraser:false, pointerType:'mouse', points:pts4}
    ];
    var off = document.createElement('canvas');
    off.width=600; off.height=600;
    var octx = off.getContext('2d');
    seedStrokes.forEach(function(s){
      for(var i=1;i<s.points.length;i++){
        octx.globalCompositeOperation='source-over';
        octx.strokeStyle=s.color; octx.lineWidth=s.width*2; octx.lineCap='round'; octx.lineJoin='round';
        octx.beginPath(); octx.moveTo(s.points[i-1].x,s.points[i-1].y); octx.lineTo(s.points[i].x,s.points[i].y); octx.stroke();
      }
    });
    return {
      id:'seed1', author:'AK', authorName:'ari.k', deviceLabel:'drawn with stylus',
      layers: [{ bgColor: null, strokes: seedStrokes }],
      canvasWidth: 600, canvasHeight: 600,
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
  window.addEventListener('resize', function(){ if(document.getElementById('drawView').classList.contains('active')) fitCanvas(); });
})();
