const state = {
  videos: [],
  currentVideoId: null,
  messages: [],
  graphData: null,
  graphCanvasSize: { width: 0, height: 0 },
  graphNodes: [],
  graphDraggingNodeId: null,
  graphDragPointerId: null,
  graphDragOffset: { x: 0, y: 0 },
  graphPointerDown: null,
  graphDragMoved: false,
  graphActiveNodeId: null,
  graphCamera: { x: 0, y: 0, scale: 1 },
  isGraphPanning: false,
  graphPanStart: { x: 0, y: 0 },
  intervals: {},
  videoChatCount: {},
  activeInterval: null,
  activeIntervalId: null,
  searchTerm: '',
  isUploading: false,
};

const selectors = {
  player: () => document.getElementById('videoPlayer'),
  videoSource: () => document.getElementById('videoSource'),
  videoList: () => document.getElementById('videoList'),
  videoCount: () => document.getElementById('videoCount'),
  videoSearchInput: () => document.getElementById('videoSearchInput'),
  videoSearchBtn: () => document.getElementById('videoSearchBtn'),
  videoSearchReset: () => document.getElementById('videoSearchReset'),
  toggleAddVideoBtn: () => document.getElementById('toggleAddVideoBtn'),
  addVideoPanel: () => document.getElementById('addVideoPanel'),
  addVideoForm: () => document.getElementById('addVideoForm'),
  cancelAddVideoBtn: () => document.getElementById('cancelAddVideoBtn'),
  videoFileInput: () => document.getElementById('videoFileInput'),
  fullscreenBtn: () => document.getElementById('fullscreenBtn'),
  chatWindow: () => document.getElementById('chatWindow'),
  modelSelect: () => document.getElementById('modelSelect'),
  userInput: () => document.getElementById('userInput'),
  sendBtn: () => document.getElementById('sendBtn'),
  graphCanvas: () => document.getElementById('graphCanvas'),
  refreshGraphBtn: () => document.getElementById('refreshGraphBtn'),
  graphFullscreenBtn: () => document.getElementById('graphFullscreenBtn'),
  graphExitFullscreenBtn: () => document.getElementById('graphExitFullscreenBtn'),
  graphTooltip: () => document.getElementById('graphTooltip'),
  intervalList: () => document.getElementById('intervalList'),
  statsSection: () => document.getElementById('statsSection'),
  statsWrapper: () => document.querySelector('.stats-wrapper'),
  dailyChartCanvas: () => document.getElementById('dailyChartCanvas'),
  monthlyChartCanvas: () => document.getElementById('monthlyChartCanvas'),
  refreshStatsBtn: () => document.getElementById('refreshStatsBtn'),
  resizerVertical: () => document.getElementById('resizerVertical'),
  resizerHorizontal: () => document.getElementById('resizerHorizontal'),
  rightTopRow: () => document.querySelector('.right-top-row'),
  graphSection: () => document.querySelector('.graph-section'),
};

let graphTooltipDismissHooked = false;

document.addEventListener('DOMContentLoaded', () => {
  bootstrapVideoLibrary();
  wireChat();
  wireVideoManagement();
  wireGraphControls();
  hookFullscreen();
  wireIntervalInteractions();
  hookIntervalPlayback();
  wireStats();
  wireResizers();
});

async function bootstrapVideoLibrary() {
  state.searchTerm = '';
  state.videos = await loadVideoManifest();
  await Promise.all(state.videos.map(populateVideoMedia));
  renderVideoList();
  if (state.videos.length) {
    selectVideo(state.videos[0].id);
  }
}

async function loadVideoManifest() {
  const sources = [
    { url: '/api/videos', label: 'api' },
    { url: './cache_videos/videos.json', label: 'manifest' },
  ];

  for (const source of sources) {
    try {
      const response = await fetch(source.url, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) {
        throw new Error('manifest missing');
      }
      const payload = await response.json();
      if (Array.isArray(payload?.videos)) {
        return payload.videos;
      }
    } catch (error) {
      console.warn(`[video manifest] ${source.label}`, error);
    }
  }

  return fallbackVideos();
}

function wireVideoManagement() {
  const searchInput = selectors.videoSearchInput();
  const searchBtn = selectors.videoSearchBtn();
  const searchResetBtn = selectors.videoSearchReset();
  const toggleBtn = selectors.toggleAddVideoBtn();
  const cancelBtn = selectors.cancelAddVideoBtn();
  const form = selectors.addVideoForm();

  if (searchInput) {
    const triggerSearch = () => applyVideoSearch(searchInput.value);
    searchInput.addEventListener('input', triggerSearch);
    searchBtn?.addEventListener('click', triggerSearch);
    searchResetBtn?.addEventListener('click', () => {
      searchInput.value = '';
      applyVideoSearch('');
    });
  }

  toggleBtn?.addEventListener('click', () => {
    const panel = selectors.addVideoPanel();
    const isOpen = panel?.classList.contains('is-open');
    setAddVideoPanelOpen(!isOpen);
  });

  cancelBtn?.addEventListener('click', () => {
    resetAddVideoForm();
    setAddVideoPanelOpen(false);
  });

  form?.addEventListener('submit', handleAddVideoSubmit);
}

function setAddVideoPanelOpen(shouldOpen) {
  const panel = selectors.addVideoPanel();
  if (!panel) return;
  panel.classList.toggle('is-open', shouldOpen);
  const toggleBtn = selectors.toggleAddVideoBtn();
  if (toggleBtn) {
    toggleBtn.textContent = shouldOpen ? '收起' : '新增视频';
  }
}

function applyVideoSearch(term = '') {
  state.searchTerm = term.trim();
  renderVideoList();
}

function getVisibleVideos() {
  if (!state.searchTerm) {
    return state.videos;
  }
  const keyword = state.searchTerm.toLowerCase();
  return state.videos.filter((video) =>
    (video.name || video.id || '')
      .toString()
      .toLowerCase()
      .includes(keyword)
  );
}

function fallbackVideos() {
  return [
    {
      id: 'demo-1',
      name: '无人机巡检示例',
      src: './cache_videos/drone_demo.mp4',
      tags: ['电力巡检', '高空'],
      summary: '无人机沿输电线路巡检，重点关注绝缘子与导线。',
    },
    {
      id: 'demo-2',
      name: '工厂安全巡游',
      src: './cache_videos/factory_walkthrough.mp4',
      tags: ['安全帽', '流水线'],
      summary: '厂区巡游识别安全隐患，统计安全工装佩戴情况。',
    },
  ];
}

async function populateVideoMedia(video) {
  try {
    const media = await extractMediaInfo(video.src);
    video.durationSeconds = media.duration;
    video.durationFormatted = formatDuration(media.duration);
    video.thumbnail = media.thumbnail;
  } catch (error) {
    console.warn('[media extraction]', video.src, error);
    video.durationSeconds = video.durationSeconds ?? 0;
    video.durationFormatted = video.durationFormatted ?? '未知';
    video.thumbnail = video.thumbnail ?? placeholderThumbnail(video.name);
  }
}

function extractMediaInfo(src) {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.muted = true;
    videoEl.crossOrigin = 'anonymous';
    videoEl.src = src;

    let settled = false;
    const cleanup = () => {
      videoEl.removeEventListener('loadeddata', handleLoaded);
      videoEl.removeEventListener('loadedmetadata', handleLoaded);
      videoEl.removeEventListener('seeked', handleSeeked);
      videoEl.removeEventListener('error', handleError);
      videoEl.remove();
    };

    const finalize = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 320;
        canvas.height = videoEl.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const thumbnail = canvas.toDataURL('image/jpeg', 0.72);
        settled = true;
        cleanup();
        resolve({
          duration: videoEl.duration || 0,
          thumbnail,
        });
      } catch (err) {
        settled = true;
        cleanup();
        reject(err);
      }
    };

    const handleSeeked = () => {
      videoEl.removeEventListener('seeked', handleSeeked);
      finalize();
    };

    const handleLoaded = () => {
      videoEl.removeEventListener('loadeddata', handleLoaded);
      videoEl.removeEventListener('loadedmetadata', handleLoaded);

      if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0) {
        finalize();
        return;
      }
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0.2) {
        const targetTime = Math.min(0.1, videoEl.duration / 2);
        videoEl.addEventListener('seeked', handleSeeked);
        try {
          videoEl.currentTime = targetTime;
        } catch (error) {
          finalize();
        }
      } else {
        finalize();
      }
    };

    const handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(event);
    };

    videoEl.addEventListener('loadeddata', handleLoaded);
    videoEl.addEventListener('loadedmetadata', handleLoaded);
    videoEl.addEventListener('error', handleError);
  });
}

function placeholderThumbnail(label = 'VIDEO') {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1f2937');
  gradient.addColorStop(1, '#312e81');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 16px Inter';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.slice(0, 6), canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL('image/png');
}

function renderVideoList() {
  const list = selectors.videoList();
  const visibleVideos = getVisibleVideos();
  list.innerHTML = '';
  const countEl = selectors.videoCount();
  if (countEl) {
    countEl.textContent = state.searchTerm
      ? `${visibleVideos.length}/${state.videos.length}`
      : state.videos.length;
  }

  if (!visibleVideos.length) {
    const empty = document.createElement('li');
    empty.className = 'video-empty';
    empty.textContent = state.searchTerm
      ? '未找到匹配的视频'
      : '还没有可用的视频';
    list.appendChild(empty);
    return;
  }

  visibleVideos.forEach((video) => {
    const item = document.createElement('li');
    item.className = 'video-card';
    item.dataset.videoId = video.id;

    if (video.id === state.currentVideoId) {
      item.classList.add('active');
    }

    const thumbSrc = video.thumbnail || placeholderThumbnail(video.name);
    const duration = video.durationFormatted || '--:--';

    item.innerHTML = `
      <img src="${thumbSrc}" alt="${video.name}" loading="lazy" />
      <div class="video-info">
        <strong>${video.name}</strong>
        <span>${duration}</span>
      </div>
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-video-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDeleteVideo(video.id, video.name);
    });

    // 将删除按钮添加到 video-info 容器中，以便在同一行显示
    item.querySelector('.video-info').appendChild(deleteBtn);
    item.addEventListener('click', () => selectVideo(video.id));
    list.appendChild(item);
  });
}

async function handleAddVideoSubmit(event) {
  event.preventDefault();
  if (state.isUploading) return;

  const form = event.target;
  const fileInput = selectors.videoFileInput();
  if (!fileInput || !fileInput.files?.length) {
    alert('请先选择要上传的视频文件');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = '上传中...';
  state.isUploading = true;

  try {
    const formData = new FormData(form);
    const response = await fetch('/api/videos', {
      method: 'POST',
      body: formData,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.video) {
      throw new Error(payload?.error || '上传失败，请稍后再试');
    }
    const video = payload.video;
    await populateVideoMedia(video);
    state.videos = [video, ...state.videos];
    resetAddVideoForm();
    setAddVideoPanelOpen(false);
    renderVideoList();
    selectVideo(video.id);
  } catch (error) {
    alert(error.message);
  } finally {
    state.isUploading = false;
    submitBtn.disabled = false;
    submitBtn.textContent = '上传';
  }
}

function resetAddVideoForm() {
  const form = selectors.addVideoForm();
  if (!form) return;
  form.reset();
}

async function handleDeleteVideo(videoId, videoName = '') {
  if (!videoId) return;
  const confirmed = window.confirm(`确定删除「${videoName || videoId}」吗？`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || '删除失败，请稍后再试');
    }

    state.videos = state.videos.filter((video) => video.id !== videoId);
    if (state.currentVideoId === videoId) {
      const nextVideo = state.videos[0];
      if (nextVideo) {
        selectVideo(nextVideo.id);
      } else {
        state.currentVideoId = null;
        const player = selectors.player();
        selectors.videoSource().src = '';
        player.load();
        renderVideoList();
      }
    } else {
      renderVideoList();
    }
  } catch (error) {
    alert(error.message);
  }
}

function selectVideo(videoId) {
  const video = state.videos.find((v) => v.id === videoId);
  if (!video) return;

  state.currentVideoId = videoId;
  state.activeInterval = null;
  state.activeIntervalId = null;
  const player = selectors.player();
  player.loop = true;
  selectors.videoSource().src = video.src;
  player.load();
  player.play().catch(() => undefined);

  renderVideoList();
  renderIntervals(videoId);
  refreshGraph();
}

function wireChat() {
  selectors.sendBtn().addEventListener('click', handleChatSubmit);
  selectors.userInput().addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChatSubmit();
    }
  });
}

async function handleChatSubmit() {
  const inputEl = selectors.userInput();
  const text = inputEl.value.trim();
  if (!text) return;

  appendMessage('user', text);
  inputEl.value = '';

  const model = selectors.modelSelect().value;
  const video = state.videos.find((v) => v.id === state.currentVideoId);
  if (!video) {
    appendMessage('bot', '请先选择左侧的视频。');
    return;
  }

  const exchangeIndex = state.videoChatCount[video.id] ?? 0;

  appendMessage('bot', '正在向模型请求推理结果...');
  try {
    const { answer, intervals } = await mockLLMResponse(
      text,
      model,
      video,
      exchangeIndex,
    );
    replaceLastBotMessage(answer);
    state.videoChatCount[video.id] = exchangeIndex + 1;

    if (intervals?.length) {
      state.intervals[video.id] = intervals;
      renderIntervals(video.id);
    }

    // Simulate stats update if anomaly detected
    if (answer.includes('异常') || answer.includes('检测到')) {
      const statsSection = selectors.statsSection();
      if (statsSection) {
        // Trigger click animation and refresh
        statsSection.click();
      }
    }
  } catch (error) {
    replaceLastBotMessage('模型暂时不可用，请稍后重试。');
  }
}

function appendMessage(role, text) {
  const chatWindow = selectors.chatWindow();
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  state.messages.push({ role, text });
}

function replaceLastBotMessage(text) {
  const chatWindow = selectors.chatWindow();
  const last = [...chatWindow.querySelectorAll('.message.bot')].pop();
  if (last) {
    last.textContent = text;
    state.messages[state.messages.length - 1].text = text;
  } else {
    appendMessage('bot', text);
  }
}

function mockLLMResponse(prompt, model, video, exchangeIndex = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const context = video ? `结合视频《${video.name}》` : '结合当前上下文';
      const answer = `${context}，模型(${model})给出初步分析：${prompt.slice(
        0,
        120,
      )}...`;

      const intervals =
        exchangeIndex === 0 && video ? synthesizeIntervals(video) : undefined;

      resolve({ answer, intervals });
    }, 900);
  });
}

function wireGraphControls() {
  selectors.refreshGraphBtn().addEventListener('click', refreshGraph);
  
  const fsBtn = selectors.graphFullscreenBtn();
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      const container = document.getElementById('graphContainer');
      if (!document.fullscreenElement) {
        container.requestFullscreen?.().catch(() => undefined);
      } else {
        document.exitFullscreen?.();
      }
    });
  }

  const exitFsBtn = selectors.graphExitFullscreenBtn();
  if (exitFsBtn) {
    exitFsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    });
  }

  document.addEventListener('fullscreenchange', () => {
    const container = document.getElementById('graphContainer');
    const fsBtn = selectors.graphFullscreenBtn();
    if (document.fullscreenElement === container) {
      if (fsBtn) fsBtn.textContent = '退出';
      container.classList.add('is-fullscreen');
    } else {
      if (fsBtn) fsBtn.textContent = '全屏';
      container.classList.remove('is-fullscreen');
      
      // Reset camera to initial state
      state.graphCamera = { x: 0, y: 0, scale: 1 };
    }
    // Give browser a moment to resize layout
    setTimeout(() => {
      scaleGraphNodesToCanvas();
      renderGraph();
    }, 100);
  });

  window.addEventListener('resize', () => {
    if (!state.graphData) return;
    scaleGraphNodesToCanvas();
    renderGraph();
  });
  hookGraphInteractions();
}

function refreshGraph() {
  const video = state.videos.find((v) => v.id === state.currentVideoId);
  state.graphData = handle_graph(video);
  const canvas = selectors.graphCanvas();
  const parent = canvas?.parentElement;
  state.graphNodes = layoutGraphNodes(state.graphData, {
    width: parent?.clientWidth ?? state.graphCanvasSize.width,
    height: parent?.clientHeight ?? state.graphCanvasSize.height,
  });
  state.graphActiveNodeId = null;
  hideGraphTooltip();
  renderGraph();
}

function renderGraph(graphData = state.graphData) {
  const canvas = selectors.graphCanvas();
  if (!canvas || !graphData) return;

  const parent = canvas.parentElement;
  const { width: parentWidth, height: parentHeight } = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = parentWidth * dpr;
  canvas.height = parentHeight * dpr;
  canvas.style.width = `${parentWidth}px`;
  canvas.style.height = `${parentHeight}px`;
  state.graphCanvasSize = { width: parentWidth, height: parentHeight };

  if (!state.graphNodes?.length) {
    state.graphNodes = layoutGraphNodes(graphData, {
      width: parentWidth,
      height: parentHeight,
    });
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, parentWidth, parentHeight);

  // Background
  const gradient = ctx.createLinearGradient(0, 0, parentWidth, parentHeight);
  gradient.addColorStop(0, 'rgba(0, 242, 255, 0.05)');
  gradient.addColorStop(1, 'rgba(24, 144, 255, 0.03)');
  ctx.fillStyle = 'rgba(5, 14, 24, 0.7)';
  ctx.fillRect(0, 0, parentWidth, parentHeight);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, parentWidth, parentHeight);

  // Apply Camera Transform
  ctx.save();
  ctx.translate(state.graphCamera.x, state.graphCamera.y);
  ctx.scale(state.graphCamera.scale, state.graphCamera.scale);

  // Grid
  const gridSize = 40;
  const visibleLeft = -state.graphCamera.x / state.graphCamera.scale;
  const visibleTop = -state.graphCamera.y / state.graphCamera.scale;
  const visibleRight = (parentWidth - state.graphCamera.x) / state.graphCamera.scale;
  const visibleBottom = (parentHeight - state.graphCamera.y) / state.graphCamera.scale;

  const startX = Math.floor(visibleLeft / gridSize) * gridSize;
  const startY = Math.floor(visibleTop / gridSize) * gridSize;

  ctx.strokeStyle = 'rgba(0, 242, 255, 0.06)';
  ctx.lineWidth = 1 / state.graphCamera.scale;

  ctx.beginPath();
  for (let x = startX; x < visibleRight + gridSize; x += gridSize) {
    ctx.moveTo(x, visibleTop);
    ctx.lineTo(x, visibleBottom);
  }
  for (let y = startY; y < visibleBottom + gridSize; y += gridSize) {
    ctx.moveTo(visibleLeft, y);
    ctx.lineTo(visibleRight, y);
  }
  ctx.stroke();

  const nodes = state.graphNodes;
  const coreNode = nodes.find((node) => node.type === 'core') ?? nodes[0];

  // Edges (All to Core, Straight)
  if (coreNode) {
    nodes.forEach((node) => {
      if (node === coreNode) return;

      const strokeColor = 'rgba(255,255,255,0.2)';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(node.x, node.y);
      ctx.lineTo(coreNode.x, coreNode.y);
      ctx.stroke();
    });
  }

  // Nodes
  nodes.forEach((node) => {
    const { fill, stroke } = getGraphNodeTheme(node);
    const radius = getGraphNodeRadius(node);
    
    ctx.beginPath();
    ctx.lineWidth = node.id === state.graphActiveNodeId ? 3 : 2;
    ctx.strokeStyle = stroke;
    ctx.fillStyle = fill;
    
    if (node.id === state.graphActiveNodeId) {
      ctx.shadowColor = 'rgba(0, 242, 255, 0.8)';
      ctx.shadowBlur = 22;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#d8e8ff';
    ctx.font = '12px "Inter", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, node.x, node.y + radius + 6);
  });

  ctx.restore(); // Restore camera
  ctx.restore(); // Restore DPR
}

const GRAPH_NODE_THEME = {
  core: { fill: 'rgba(0, 242, 255, 0.35)', stroke: 'rgba(0, 242, 255, 0.9)' },
  summary: { fill: 'rgba(24, 144, 255, 0.25)', stroke: 'rgba(24, 144, 255, 0.9)' },
  meta: { fill: 'rgba(111, 255, 233, 0.15)', stroke: 'rgba(111, 255, 233, 0.7)' },
  metric: { fill: 'rgba(255, 169, 64, 0.2)', stroke: 'rgba(255, 169, 64, 0.8)' },
  tag: { fill: 'rgba(138, 115, 255, 0.2)', stroke: 'rgba(138, 115, 255, 0.75)' },
  hub: { fill: 'rgba(255, 255, 255, 0.08)', stroke: 'rgba(255, 255, 255, 0.45)' },
  status: { fill: 'rgba(255, 99, 125, 0.2)', stroke: 'rgba(255, 99, 125, 0.85)' },
  insight: { fill: 'rgba(0, 0, 0, 0.35)', stroke: 'rgba(0, 242, 255, 0.4)' },
  default: { fill: 'rgba(255,255,255,0.2)', stroke: 'rgba(255,255,255,0.6)' },
};

function getGraphNodeTheme(node) {
  return GRAPH_NODE_THEME[node.type] ?? GRAPH_NODE_THEME.default;
}

function getGraphNodeRadius(node) {
  if (node.type === 'core') return 18;
  if (node.type === 'hub') return 15;
  if (node.type === 'tag') return 10;
  if (node.type === 'insight') return 12;
  return node.fixed ? 14 : 12;
}

function layoutGraphNodes(graphData, bounds = {}) {
  const canvas = selectors.graphCanvas();
  const width = bounds.width ?? canvas?.parentElement?.clientWidth ?? 360;
  const height = bounds.height ?? canvas?.parentElement?.clientHeight ?? 240;
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes = (graphData.nodes ?? []).map((node) => ({ ...node }));

  const coreNode = nodes.find((node) => node.fixed || node.type === 'core') ?? nodes[0];
  if (coreNode) {
    coreNode.x = centerX;
    coreNode.y = centerY;
    coreNode.fixed = true;
  }

  const shortestSide = Math.min(width, height);
  const ringConfigs = [
    { types: ['summary', 'status'], radius: Math.max(shortestSide * 0.15, 50), phase: 0 },
    { types: ['meta', 'metric'], radius: Math.max(shortestSide * 0.22, 80), phase: Math.PI / 6 },
    { types: ['hub'], radius: Math.max(shortestSide * 0.28, 100), phase: Math.PI / 4 },
    { types: ['tag', 'insight'], radius: Math.max(shortestSide * 0.35, 130), phase: Math.PI / 3 },
  ];

  ringConfigs.forEach(({ types, radius, phase }) => {
    const groupNodes = nodes.filter((node) => types.includes(node.type));
    if (!groupNodes.length) return;
    groupNodes.forEach((node, index) => {
      const angle = phase + (index / Math.max(groupNodes.length, 1)) * Math.PI * 2;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });
  });

  const leftovers = nodes.filter((node) => node.x === undefined || node.y === undefined);
  leftovers.forEach((node, index) => {
    const radius = Math.max(shortestSide * 0.25, 90);
    const angle = (index / Math.max(leftovers.length, 1)) * Math.PI * 2;
    node.x = centerX + radius * Math.cos(angle);
    node.y = centerY + radius * Math.sin(angle);
  });

  return nodes;
}

function scaleGraphNodesToCanvas() {
  const canvas = selectors.graphCanvas();
  if (!canvas || !state.graphNodes?.length) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  const newWidth = parent.clientWidth;
  const newHeight = parent.clientHeight;
  const prevWidth = state.graphCanvasSize.width || newWidth;
  const prevHeight = state.graphCanvasSize.height || newHeight;

  if (!prevWidth || !prevHeight) {
    state.graphCanvasSize = { width: newWidth, height: newHeight };
    return;
  }

  const scaleX = newWidth / prevWidth;
  const scaleY = newHeight / prevHeight;

  state.graphNodes.forEach((node) => {
    node.x *= scaleX;
    node.y *= scaleY;
  });

  state.graphCanvasSize = { width: newWidth, height: newHeight };
}

function hookGraphInteractions() {
  const canvas = selectors.graphCanvas();
  if (!canvas) return;

  canvas.addEventListener('pointerdown', handleGraphPointerDown);
  canvas.addEventListener('pointermove', handleGraphPointerMove);
  canvas.addEventListener('pointerup', handleGraphPointerUp);
  canvas.addEventListener('pointerleave', handleGraphPointerUp);
  canvas.addEventListener('pointercancel', handleGraphPointerUp);
  canvas.addEventListener('wheel', handleGraphWheel, { passive: false });

  if (!graphTooltipDismissHooked) {
    document.addEventListener('pointerdown', (event) => {
      const graphCanvas = selectors.graphCanvas();
      if (!graphCanvas) return;
      if (event.target === graphCanvas || graphCanvas.contains(event.target)) {
        return;
      }
      state.graphActiveNodeId = null;
      hideGraphTooltip();
      if (state.graphData) {
        renderGraph();
      }
    });
    graphTooltipDismissHooked = true;
  }
}

function handleGraphPointerDown(event) {
  const canvas = selectors.graphCanvas();
  if (!canvas || !state.graphNodes?.length) return;

  const worldPos = getGraphWorldPosition(event, canvas);
  const target = findGraphNodeAtPosition(worldPos);
  
  if (target) {
    state.graphActiveNodeId = target.id;
    renderGraph();
    return;
  }

  hideGraphTooltip();
  state.graphActiveNodeId = null;
  
  state.isGraphPanning = true;
  state.graphDragPointerId = event.pointerId;
  const screenPos = getGraphPointerPosition(event, canvas);
  state.graphPanStart = { x: screenPos.x, y: screenPos.y };
  state.graphCameraStart = { ...state.graphCamera };
  
  canvas.setPointerCapture?.(event.pointerId);
  renderGraph();
}

function handleGraphPointerMove(event) {
  const canvas = selectors.graphCanvas();
  if (!canvas) return;

  if (state.isGraphPanning) {
    if (state.graphDragPointerId !== null && event.pointerId !== state.graphDragPointerId) return;
    
    const screenPos = getGraphPointerPosition(event, canvas);
    const dx = screenPos.x - state.graphPanStart.x;
    const dy = screenPos.y - state.graphPanStart.y;
    
    state.graphCamera.x = state.graphCameraStart.x + dx;
    state.graphCamera.y = state.graphCameraStart.y + dy;
    
    renderGraph();
  }
}

function handleGraphPointerUp(event) {
  const canvas = selectors.graphCanvas();
  if (!canvas) return;
  
  if (state.isGraphPanning) {
    if (state.graphDragPointerId !== null && event.pointerId !== state.graphDragPointerId) return;
    state.isGraphPanning = false;
    state.graphDragPointerId = null;
    canvas.releasePointerCapture?.(event.pointerId);
    return;
  }

  const worldPos = getGraphWorldPosition(event, canvas);
  const target = findGraphNodeAtPosition(worldPos);
  if (target) {
    state.graphActiveNodeId = target.id;
    showGraphTooltip(target, event.clientX, event.clientY);
  } else {
    state.graphActiveNodeId = null;
    hideGraphTooltip();
  }

  renderGraph();
}

function handleGraphWheel(event) {
  event.preventDefault();
  const canvas = selectors.graphCanvas();
  if (!canvas) return;

  const zoomIntensity = 0.1;
  const delta = event.deltaY < 0 ? 1 : -1;
  const zoomFactor = Math.exp(delta * zoomIntensity);
  
  const screenPos = getGraphPointerPosition(event, canvas);
  const worldPos = getGraphWorldPosition(event, canvas);
  
  const newScale = Math.max(0.1, Math.min(5, state.graphCamera.scale * zoomFactor));
  
  state.graphCamera.x = screenPos.x - worldPos.x * newScale;
  state.graphCamera.y = screenPos.y - worldPos.y * newScale;
  state.graphCamera.scale = newScale;
  
  renderGraph();
}

function getGraphPointerPosition(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function getGraphWorldPosition(event, canvas) {
  const { x, y } = getGraphPointerPosition(event, canvas);
  return {
    x: (x - state.graphCamera.x) / state.graphCamera.scale,
    y: (y - state.graphCamera.y) / state.graphCamera.scale,
  };
}

function findGraphNodeAtPosition(position) {
  const nodes = state.graphNodes ?? [];
  return nodes
    .slice()
    .reverse()
    .find((node) => {
      const radius = getGraphNodeRadius(node);
      const dx = position.x - node.x;
      const dy = position.y - node.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius + 4;
    });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function showGraphTooltip(node, clientX, clientY) {
  const tooltip = selectors.graphTooltip();
  const canvas = selectors.graphCanvas();
  if (!tooltip || !canvas) return;

  const containerRect = canvas.parentElement?.getBoundingClientRect();
  if (!containerRect) return;
  const offsetX = clientX - containerRect.left + 14;
  const offsetY = clientY - containerRect.top + 14;
  const maxX = containerRect.width - 20;
  const maxY = containerRect.height - 20;

  tooltip.innerHTML = `
    <strong>${node.label}</strong>
    <p>${node.detail || '暂无描述'}</p>
  `;
  tooltip.style.left = `${clamp(offsetX, 12, maxX)}px`;
  tooltip.style.top = `${clamp(offsetY, 12, maxY)}px`;
  tooltip.classList.add('is-visible');
}

function hideGraphTooltip() {
  const tooltip = selectors.graphTooltip();
  if (!tooltip) return;
  tooltip.classList.remove('is-visible');
}

function hookFullscreen() {
  const btn = selectors.fullscreenBtn();
  btn.addEventListener('click', () => {
    const playerSection = document.querySelector('.player-section');
    if (!document.fullscreenElement) {
      playerSection.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      btn.textContent = '缩小';
    } else {
      btn.textContent = '全屏';
    }
  });
}

/**
 * handle_graph
 * 根据当前视频元数据返回知识图谱结构
 * @param {Object} videoMeta
 * @returns {{nodes: Array, edges: Array}}
 */
function handle_graph(videoMeta) {
  if (!videoMeta) {
    return {
      nodes: [
        { id: 'context', label: '通用上下文', type: 'core', detail: '尚未选择视频，展示默认关系' , fixed: true},
        { id: 'task', label: '任务', type: 'summary', detail: '结合场景定义分析目标' },
        { id: 'scene', label: '场景', type: 'meta', detail: '默认基础场景节点' },
        { id: 'risk', label: '潜在风险', type: 'status', detail: '风险取决于具体视频内容' },
      ],
      edges: [
        { from: 'context', to: 'task' },
        { from: 'context', to: 'scene' },
        { from: 'task', to: 'risk' },
      ],
    };
  }

  const tags = videoMeta.tags ?? [];
  const safeName = videoMeta.name || '未命名视频';
  const durationLabel = videoMeta.durationFormatted ?? formatDuration(videoMeta.durationSeconds);
  const durationDetail = describeDurationDetail(videoMeta);
  const uploadedLabel = formatUploadTime(videoMeta.uploadedAt);
  const summaryText = (videoMeta.summary || '').trim() || '尚未提供摘要';
  const tagNodes = tags.map((tag, idx) => ({
    id: `tag-${idx}`,
    label: tag,
    type: 'tag',
    detail: `标签：${tag}`,
  }));
  const statusNode = deriveStatusNode(videoMeta);
  const insightNodes = deriveGraphInsights(videoMeta);

  const nodes = [
    { id: 'video', label: safeName, type: 'core', detail: `来源：${videoMeta.src || '未知'}`, fixed: true },
    { id: 'summary', label: '内容摘要', type: 'summary', detail: summaryText },
    { id: 'duration', label: `时长 ${durationLabel}`, type: 'metric', detail: durationDetail },
    { id: 'uploaded', label: '上传时间', type: 'meta', detail: uploadedLabel },
    { id: 'tag-hub', label: '标签集合', type: 'hub', detail: tags.length ? tags.join('、') : '暂无标签' },
    statusNode,
    ...tagNodes,
    ...insightNodes,
  ].filter(Boolean);

  const edges = [
    { from: 'video', to: 'summary', type: 'highlight' },
    { from: 'video', to: 'duration' },
    { from: 'video', to: 'uploaded' },
    { from: 'video', to: 'tag-hub' },
    { from: 'video', to: statusNode.id },
    ...tagNodes.map((node) => ({ from: 'tag-hub', to: node.id })),
    ...insightNodes.map((node) => ({ from: node.anchor ?? 'summary', to: node.id, type: 'highlight' })),
  ];

  return { nodes, edges };
}

function describeDurationDetail(videoMeta) {
  const seconds = Number(videoMeta.durationSeconds) || 0;
  if (!seconds) return '无法获取精确时长，建议重新加载视频元信息';
  const minutes = (seconds / 60).toFixed(1);
  return `总时长约 ${minutes} 分钟（${Math.round(seconds)} 秒）`;
}

function formatUploadTime(value) {
  if (!value) return '尚未记录上传时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '上传时间格式异常';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function deriveStatusNode(videoMeta) {
  const tags = (videoMeta.tags ?? []).map((tag) => tag.toLowerCase());
  let label = '巡检概况';
  let detail = '尚未检测到明确的风险标签';

  if (tags.some((tag) => tag.includes('火') || tag.includes('烟'))) {
    label = '火情关注';
    detail = '包含火情/烟雾相关标签，建议优先查看热源区域';
  } else if (tags.some((tag) => tag.includes('安全') || tag.includes('告警'))) {
    label = '安全告警';
    detail = '存在安全类标签，可检查安全工装佩戴或告警提示';
  } else if (tags.length === 0) {
    label = '待标注';
    detail = '暂无标签，建议补充关键字以便模型理解场景';
  }

  return { id: 'status', label, type: 'status', detail };
}

function deriveGraphInsights(videoMeta) {
  const insights = [];
  const durationSeconds = Number(videoMeta.durationSeconds) || 0;
  const tags = videoMeta.tags ?? [];

  if (durationSeconds >= 300) {
    insights.push({
      label: '长时段巡检',
      detail: '视频超过 5 分钟，适合拆分重点片段查看',
      anchor: 'duration',
    });
  } else if (durationSeconds > 0 && durationSeconds < 60) {
    insights.push({
      label: '短片段记录',
      detail: '时长不足 1 分钟，模型可能需要更多上下文',
      anchor: 'duration',
    });
  }

  if ((tags ?? []).length >= 4) {
    insights.push({
      label: '多标签场景',
      detail: '标签较多，建议聚焦最重要的 3 个标签',
      anchor: 'tag-hub',
    });
  }

  if (!videoMeta.summary || !videoMeta.summary.trim()) {
    insights.push({
      label: '缺少摘要',
      detail: '内容摘要为空，可在对话区快速描述重点场景',
      anchor: 'summary',
    });
  }

  return insights.map((entry, idx) => ({
    id: `insight-${idx}`,
    type: 'insight',
    ...entry,
  }));
}

function wireIntervalInteractions() {
  const list = selectors.intervalList();
  list.addEventListener('click', (event) => {
    const chip = event.target.closest('.interval-chip');
    if (!chip) return;

    const videoId = state.currentVideoId;
    const intervals = state.intervals[videoId];
    if (!intervals) return;

    const interval = intervals.find((entry) => entry.id === chip.dataset.interval);
    if (interval) {
      if (interval.id === state.activeIntervalId) {
        resetIntervalPlayback(true);
      } else {
        playInterval(interval);
      }
    }
  });
}

function renderIntervals(videoId) {
  const container = selectors.intervalList();
  container.innerHTML = '';
  const slots = state.intervals[videoId];

  if (!slots || !slots.length) {
    container.innerHTML = `<span class="interval-placeholder">首次向模型提问后自动生成检测片段</span>`;
    return;
  }

  slots.forEach((slot) => {
    const chip = document.createElement('button');
    chip.className = 'interval-chip';
    chip.dataset.interval = slot.id;
    chip.textContent = slot.label;
    if (slot.id === state.activeIntervalId) {
      chip.classList.add('active');
    }
    container.appendChild(chip);
  });
}

function playInterval(interval) {
  const player = selectors.player();
  state.activeInterval = interval;
  state.activeIntervalId = interval.id;
  player.loop = false;
  player.currentTime = interval.start;
  player.play().catch(() => undefined);
  renderIntervals(state.currentVideoId);
}

function resetIntervalPlayback(shouldRerender = false) {
  const player = selectors.player();
  state.activeInterval = null;
  state.activeIntervalId = null;
  player.loop = true;
  if (shouldRerender && state.currentVideoId) {
    renderIntervals(state.currentVideoId);
  }
}

function hookIntervalPlayback() {
  const player = selectors.player();
  player.addEventListener('timeupdate', () => {
    const clip = state.activeInterval;
    if (!clip) return;

    if (player.currentTime >= clip.end) {
      player.pause();
      resetIntervalPlayback(true);
    }
  });
}

function synthesizeIntervals(video) {
  const duration = Number(video.durationSeconds) || 90;
  const segmentCount = Math.min(4, Math.max(2, Math.round(duration / 45)));
  const slice = duration / (segmentCount + 1);
  const intervals = [];

  for (let i = 0; i < segmentCount; i += 1) {
    const start = Math.max(0, Math.round((i + 1) * slice - 8));
    const end = Math.min(duration, start + 18);
    intervals.push({
      id: `${video.id}-interval-${i}`,
      start,
      end,
      label: `${formatTimestamp(start)}-${formatTimestamp(end)}`,
    });
  }

  return intervals;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTimestamp(seconds) {
  return formatDuration(seconds);
}

function wireStats() {
  const statsSection = selectors.statsSection();
  if (!statsSection) return;

  // UCF-Crime Labels (Translated)
  const ucfLabels = [
    '虐待', '逮捕', '纵火', '袭击', '入室盗窃', '爆炸', '打斗', 
    '交通事故', '抢劫', '射击', '偷窃', '入店行窃', '破坏'
  ];

  let dailyChartInstance = null;
  let monthlyChartInstance = null;

  // Chart.js Global Defaults
  if (window.Chart) {
    Chart.defaults.color = '#8fbcdb';
    Chart.defaults.font.family = '"JetBrains Mono", "Inter", sans-serif';
    Chart.defaults.borderColor = 'rgba(29, 79, 122, 0.3)';
  }

  const refreshCharts = () => {
    // Generate random data
    const dailyData = ucfLabels.map(() => Math.floor(Math.random() * 15));
    // Generate monthly data (Top 5)
    const monthlyRaw = ucfLabels.map(label => ({
      label,
      value: Math.floor(Math.random() * 100) + 20
    })).sort((a, b) => b.value - a.value).slice(0, 5);

    // Render Daily Chart
    const dailyCtx = selectors.dailyChartCanvas()?.getContext('2d');
    if (dailyCtx) {
      if (dailyChartInstance) dailyChartInstance.destroy();
      
      // Create gradient (Cyberpunk: Top Light/White -> Bottom Deep/Transparent)
      const gradient = dailyCtx.createLinearGradient(0, 0, 0, 200);
      gradient.addColorStop(0, 'rgba(200, 255, 255, 0.9)'); // Top: Bright
      gradient.addColorStop(0.3, 'rgba(0, 242, 255, 0.6)'); // Mid-Top: Cyan
      gradient.addColorStop(1, 'rgba(0, 242, 255, 0.1)');   // Bottom: Faded

      dailyChartInstance = new Chart(dailyCtx, {
        type: 'bar',
        data: {
          labels: ucfLabels,
          datasets: [{
            label: '告警次数',
            data: dailyData,
            backgroundColor: gradient,
            borderColor: '#00f2ff',
            borderWidth: { top: 2, right: 1, bottom: 0, left: 1 }, // Top highlight
            barPercentage: 0.6,
            borderRadius: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(5, 14, 24, 0.95)',
              titleColor: '#00f2ff',
              bodyColor: '#e6f7ff',
              borderColor: '#1d4f7a',
              borderWidth: 1,
              displayColors: false,
              callbacks: {
                label: (ctx) => ` ${ctx.raw} 次`
              }
            }
          },
          scales: {
            y: { 
              beginAtZero: true, 
              grid: { color: 'rgba(29, 79, 122, 0.2)' },
              ticks: { color: '#8fbcdb' }
            },
            x: { 
              ticks: { 
                maxRotation: 45, 
                minRotation: 45,
                font: { size: 10 },
                color: '#8fbcdb'
              },
              grid: { display: false }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeOutQuart', // Smooth growth
            delay: (context) => {
              let delay = 0;
              if (context.type === 'data' && context.mode === 'default' && !dailyChartInstance) {
                delay = context.dataIndex * 30 + context.datasetIndex * 100;
              }
              return delay;
            }
          }
        }
      });
    }

    // Render Monthly Chart
    const monthlyCtx = selectors.monthlyChartCanvas()?.getContext('2d');
    if (monthlyCtx) {
      if (monthlyChartInstance) monthlyChartInstance.destroy();

      // Gradient: Left Light -> Right Deep (or vice versa)
      // Usually "Growth" implies the end (Right) is the "Head".
      // Let's make the Right side (Value end) bright.
      const gradientBlue = monthlyCtx.createLinearGradient(0, 0, 300, 0);
      gradientBlue.addColorStop(0, 'rgba(24, 144, 255, 0.1)'); // Left: Faded
      gradientBlue.addColorStop(1, 'rgba(100, 200, 255, 0.9)'); // Right: Bright

      monthlyChartInstance = new Chart(monthlyCtx, {
        type: 'bar',
        data: {
          labels: monthlyRaw.map(d => d.label),
          datasets: [{
            label: '月度总计',
            data: monthlyRaw.map(d => d.value),
            backgroundColor: gradientBlue,
            borderColor: '#4da3ff',
            borderWidth: { top: 1, right: 2, bottom: 1, left: 0 }, // Right highlight
            barPercentage: 0.5,
            borderRadius: 2,
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(5, 14, 24, 0.95)',
              borderColor: '#1d4f7a',
              borderWidth: 1,
              titleColor: '#4da3ff',
              bodyColor: '#fff'
            }
          },
          scales: {
            x: { 
              beginAtZero: true, 
              grid: { color: 'rgba(29, 79, 122, 0.2)' },
              ticks: { color: '#8fbcdb' }
            },
            y: { 
              grid: { display: false },
              ticks: { color: '#e6f7ff' }
            }
          },
          animation: {
            duration: 1000,
            easing: 'easeOutQuart',
            delay: (context) => {
              let delay = 0;
              if (context.type === 'data' && context.mode === 'default' && !monthlyChartInstance) {
                delay = context.dataIndex * 50 + context.datasetIndex * 100;
              }
              return delay;
            }
          }
        }
      });
    }
  };

  // Initial load
  if (window.Chart) {
    refreshCharts();
  } else {
    // Wait for Chart.js to load if not ready
    const checkChart = setInterval(() => {
      if (window.Chart) {
        clearInterval(checkChart);
        refreshCharts();
      }
    }, 100);
  }

  // Click interaction
  statsSection.addEventListener('click', () => {
    statsSection.classList.add('active-click');
    setTimeout(() => statsSection.classList.remove('active-click'), 300);
    refreshCharts();
  });

  const refreshBtn = selectors.refreshStatsBtn();
  if (refreshBtn) {
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      refreshCharts();
    });
  }
}

function wireResizers() {
  const resizerV = selectors.resizerVertical();
  const resizerH = selectors.resizerHorizontal();
  const statsWrapper = selectors.statsWrapper();
  const graphSection = selectors.graphSection();
  const rightTopRow = selectors.rightTopRow();

  // New Resizers
  const resizerLeftRight = document.getElementById('resizerLeftRight');
  const resizerLeftPanel = document.getElementById('resizerLeftPanel');
  const leftPanel = document.querySelector('.left-panel');
  const playerSection = document.querySelector('.player-section');

  // 1. Left vs Right Panel Resizer (Vertical)
  if (resizerLeftRight && leftPanel) {
    let isResizing = false;
    let startX, startWidth;

    resizerLeftRight.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = leftPanel.getBoundingClientRect().width;
      resizerLeftRight.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      e.preventDefault();
      const dx = e.clientX - startX;
      const newWidth = startWidth + dx;
      
      // Constraints
      const minWidth = 300;
      const maxWidth = window.innerWidth - 400; // Keep at least 400px for right panel

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        leftPanel.style.width = `${newWidth}px`;
        leftPanel.style.flex = `0 0 ${newWidth}px`; // Ensure flex doesn't override
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizerLeftRight.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.dispatchEvent(new Event('resize'));
      }
    });
  }

  // 2. Left Panel Internal Resizer (Horizontal: Player vs Library)
  if (resizerLeftPanel && playerSection) {
    let isResizing = false;
    let startY, startHeight;

    resizerLeftPanel.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = playerSection.getBoundingClientRect().height;
      resizerLeftPanel.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      e.preventDefault();
      const dy = e.clientY - startY;
      const newHeight = startHeight + dy;
      
      // Constraints
      const minHeight = 200;
      const maxHeight = window.innerHeight - 200; // Keep space for library

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        playerSection.style.height = `${newHeight}px`;
        playerSection.style.flex = `0 0 ${newHeight}px`; // Ensure flex doesn't override
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizerLeftPanel.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.dispatchEvent(new Event('resize'));
      }
    });
  }

  // 3. Existing Vertical Resizer (Between Chat and Stats)
  if (resizerV && statsWrapper && rightTopRow) {
    let isResizing = false;
    let startX, startWidth;

    resizerV.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = statsWrapper.getBoundingClientRect().width;
      resizerV.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      e.preventDefault();
      const dx = startX - e.clientX; // Dragging left increases width
      const newWidth = startWidth + dx;
      
      const containerWidth = rightTopRow.getBoundingClientRect().width;
      const minWidth = 200;
      const maxWidth = containerWidth - 200;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        statsWrapper.style.width = `${newWidth}px`;
        // Force flex basis update if needed
        // statsWrapper.style.flex = `0 0 ${newWidth}px`; 
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizerV.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.dispatchEvent(new Event('resize')); // Trigger Chart.js resize
      }
    });
  }

  // Horizontal Resizer (Between Top Row and Graph)
  if (resizerH && graphSection) {
    let isResizing = false;
    let startY, startHeight;

    resizerH.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = graphSection.getBoundingClientRect().height;
      resizerH.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      e.preventDefault();
      const dy = startY - e.clientY; // Dragging up increases height
      const newHeight = startHeight + dy;
      
      const minHeight = 150;
      const maxHeight = 800;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        graphSection.style.height = `${newHeight}px`;
        graphSection.style.flex = `0 0 ${newHeight}px`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizerH.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.dispatchEvent(new Event('resize'));
      }
    });
  }
}

