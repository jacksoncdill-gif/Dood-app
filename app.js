if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}

(function(){
  var COLORS = ["#222222","#D85A30","#1D9E75","#378ADD","#7F77DD","#EF9F27"];
  var canvas = document.getElementById('drawCanvas');
  var ctx = canvas.getContext('2d');
  var swatchesEl = document.getElementById('swatches');
  var sizeSlider = document.getElementById('sizeSlider');
  var eraserBtn = document.getElementById('eraserBtn');
  var undoBtn = document.getElementById('undoBtn');
  var clearBtn = document.getElementById('clearBtn');
  var postBtn = document.getElementById('postBtn');
  var backBtn = document.getElementById('backBtn');

  var currentColor = COLORS[0];
  var isEraser = false;
  var strokes = [];
  var activeStroke = null;
  var isDrawing = false;

  function fitCanvas(){
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    redrawAll();
  }

  function toLocal(e){
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return { x:(e.clientX-rect.left)*scaleX, y:(e.clientY-rect.top)*scaleY, t: performance.now() };
  }

  function drawSeg(ctx, a, b, color, width, eraser){
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (canvas.width/300);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function redrawAll(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    strokes.forEach(function(s){
      for(var i=1;i<s.points.length;i++){
        drawSeg(ctx, s.points[i-1], s.points[i], s.color, s.width, s.eraser);
      }
      if(s.points.length===1){
        drawDot(ctx, s.points[0], s.color, s.width, s.eraser);
      }
    });
  }

  function drawDot(ctx, p, color, width, eraser){
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (width*(canvas.width/300))/2, 0, Math.PI*2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
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
    var p = toLocal(e);
    var last = activeStroke.points[activeStroke.points.length-1];
    activeStroke.points.push(p);
    drawSeg(ctx, last, p, activeStroke.color, activeStroke.width, activeStroke.eraser);
  });
  function endStroke(e){
    if(!isDrawing) return;
    isDrawing = false;
    if(activeStroke && activeStroke.points.length===1){
      drawDot(ctx, activeStroke.points[0], activeStroke.color, activeStroke.width, activeStroke.eraser);
    }
    if(activeStroke) strokes.push(activeStroke);
    activeStroke = null;
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', function(e){ if(e.buttons===0) endStroke(e); });

  COLORS.forEach(function(c, i){
    var b = document.createElement('button');
    b.className = 'swatch' + (i===0?' selected':'');
    b.style.background = c;
    b.addEventListener('click', function(){
      currentColor = c; isEraser = false;
      eraserBtn.classList.remove('active');
      Array.prototype.forEach.call(swatchesEl.children, function(el){ el.classList.remove('selected'); });
      b.classList.add('selected');
    });
    swatchesEl.appendChild(b);
  });

  eraserBtn.addEventListener('click', function(){
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active', isEraser);
  });
  undoBtn.addEventListener('click', function(){
    strokes.pop();
    redrawAll();
  });
  clearBtn.addEventListener('click', function(){
    strokes = [];
    redrawAll();
  });

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
    if(strokes.length===0){ return; }
    var majority = {};
    strokes.forEach(function(s){ majority[s.pointerType] = (majority[s.pointerType]||0)+1; });
    var bestType = Object.keys(majority).sort(function(a,b){return majority[b]-majority[a];})[0];
    var post = {
      id: 'p'+Date.now(),
      author: 'ME',
      authorName: 'you',
      deviceLabel: pointerTypeLabel(bestType),
      strokes: strokes,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      thumb: canvas.toDataURL('image/png'),
      createdAt: new Date().toISOString(),
      likes: 0
    };
    posts.unshift(post);
    savePosts();
    strokes = [];
    redrawAll();
    renderFeed();
    switchTab('feed');
  });

  backBtn.addEventListener('click', function(){
    strokes = [];
    redrawAll();
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
    var elapsed = 0;
    currentReplayPost.strokes.forEach(function(s, si){
      elapsed += si===0 ? 0 : 120; // pause between strokes
      for(var i=1;i<s.points.length;i++){
        var a = s.points[i-1], b = s.points[i];
        var delay = Math.min(Math.max(b.t - a.t, 4), 40);
        elapsed += delay;
        (function(a,b,color,width,eraser,when){
          replayTimers.push(setTimeout(function(){
            drawSegOn(replayCtx, a, b, color, width, eraser);
          }, when));
        })(a,b,s.color,s.width,s.eraser,elapsed);
      }
      if(s.points.length===1){
        elapsed += 30;
        (function(p,color,width,eraser,when){
          replayTimers.push(setTimeout(function(){
            drawDotOn(replayCtx, p, color, width, eraser);
          }, when));
        })(s.points[0], s.color, s.width, s.eraser, elapsed);
      }
    });
  }

  function drawSegOn(ctx, a, b, color, width, eraser){
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (replayCanvas.width/300);
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  function drawDotOn(ctx, p, color, width, eraser){
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x,p.y,(width*(replayCanvas.width/300))/2,0,Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
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
      strokes: seedStrokes, canvasWidth: 600, canvasHeight: 600,
      thumb: off.toDataURL('image/png'),
      createdAt: new Date(Date.now()-3600*1000*3).toISOString(), likes: 12
    };
  }

  if(posts.length===0){
    posts.push(buildSeedPost());
    savePosts();
  }

  renderFeed();
  window.addEventListener('resize', function(){ if(document.getElementById('drawView').classList.contains('active')) fitCanvas(); });
})();
