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
  intervalList: () => document.getElementById('intervalList'),
};

document.addEventListener('DOMContentLoaded', () => {
  bootstrapVideoLibrary();
  wireChat();
  wireVideoManagement();
  wireGraphControls();
  hookFullscreen();
  wireIntervalInteractions();
  hookIntervalPlayback();
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

    item.appendChild(deleteBtn);
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
  state.graphNodes = layoutGraphNodes(state.graphData);
  renderGraph();
}

function renderGraph(graphData = state.graphData) {
  const canvas = selectors.graphCanvas();
  if (!canvas || !graphData) return;

  const parent = canvas.parentElement;
  const { width: parentWidth, height: parentHeight } = parent.getBoundingClientRect();
  canvas.width = parentWidth;
  canvas.height = parentHeight;
  state.graphCanvasSize = { width: canvas.width, height: canvas.height };

  if (!state.graphNodes?.length) {
    state.graphNodes = layoutGraphNodes(graphData, {
      width: canvas.width,
      height: canvas.height,
    });
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const nodes = state.graphNodes;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edges = graphData.edges ?? [];

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.4;
  edges.forEach((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });

  nodes.forEach((node) => {
    const radius = node.fixed ? 13 : 10;
    ctx.beginPath();
    ctx.fillStyle =
      node.id === state.graphDraggingNodeId
        ? 'rgba(243,185,72,0.95)'
        : node.fixed
          ? 'rgba(77,163,255,0.9)'
          : 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.label, node.x, node.y + radius + 6);
  });
}

function layoutGraphNodes(graphData, bounds = {}) {
  const canvas = selectors.graphCanvas();
  const width = bounds.width ?? canvas?.parentElement?.clientWidth ?? 360;
  const height = bounds.height ?? canvas?.parentElement?.clientHeight ?? 240;
  const centerX = width / 2;
  const centerY = height / 2;
  const floatingNodes = [];

  const nodes = (graphData.nodes ?? []).map((node) => {
    if (node.fixed) {
      return {
        ...node,
        x: centerX,
        y: centerY,
      };
    }
    const clone = { ...node };
    floatingNodes.push(clone);
    return clone;
  });

  const radius = Math.max(Math.min(centerX, centerY) - 40, 60);
  floatingNodes.forEach((node, index) => {
    const angle = (index / Math.max(floatingNodes.length, 1)) * Math.PI * 2;
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
}

function handleGraphPointerDown(event) {
  const canvas = selectors.graphCanvas();
  if (!canvas || !state.graphNodes?.length) return;

  const position = getGraphPointerPosition(event, canvas);
  const target = findGraphNodeAtPosition(position);
  if (!target) return;

  state.graphDraggingNodeId = target.id;
  state.graphDragPointerId = event.pointerId;
  state.graphDragOffset = {
    x: target.x - position.x,
    y: target.y - position.y,
  };
  canvas.setPointerCapture?.(event.pointerId);
  renderGraph();
}

function handleGraphPointerMove(event) {
  if (!state.graphDraggingNodeId) return;
  const canvas = selectors.graphCanvas();
  if (!canvas) return;

  if (state.graphDragPointerId !== null && event.pointerId !== state.graphDragPointerId) {
    return;
  }

  const node = state.graphNodes.find((entry) => entry.id === state.graphDraggingNodeId);
  if (!node) return;

  const { x, y } = getGraphPointerPosition(event, canvas);
  const margin = 24;
  node.x = clamp(x + state.graphDragOffset.x, margin, canvas.width - margin);
  node.y = clamp(y + state.graphDragOffset.y, margin, canvas.height - margin);
  renderGraph();
}

function handleGraphPointerUp(event) {
  const canvas = selectors.graphCanvas();
  if (state.graphDragPointerId !== null && event.pointerId !== state.graphDragPointerId) {
    return;
  }
  state.graphDraggingNodeId = null;
  state.graphDragPointerId = null;
  state.graphDragOffset = { x: 0, y: 0 };
  canvas?.releasePointerCapture?.(event.pointerId);
  renderGraph();
}

function getGraphPointerPosition(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function findGraphNodeAtPosition(position) {
  const nodes = state.graphNodes ?? [];
  return nodes
    .slice()
    .reverse()
    .find((node) => {
      const radius = node.fixed ? 13 : 10;
      const dx = position.x - node.x;
      const dy = position.y - node.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius + 4;
    });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hookFullscreen() {
  selectors.fullscreenBtn().addEventListener('click', () => {
    const playerSection = document.querySelector('.player-section');
    if (!document.fullscreenElement) {
      playerSection.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.();
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
        { id: 'context', label: '通用上下文', fixed: true },
        { id: 'task', label: '任务' },
        { id: 'scene', label: '场景' },
        { id: 'risk', label: '潜在风险' },
      ],
      edges: [
        { from: 'context', to: 'task' },
        { from: 'context', to: 'scene' },
        { from: 'task', to: 'risk' },
      ],
    };
  }

  const tags = videoMeta.tags ?? [];
  const tagNodes = tags.map((tag, idx) => ({
    id: `tag-${idx}`,
    label: tag,
  }));

  return {
    nodes: [
      { id: 'video', label: videoMeta.name, fixed: true },
      {
        id: 'duration',
        label: `时长 ${videoMeta.durationFormatted ?? '未知'}`,
      },
      { id: 'summary', label: '关键描述' },
      ...tagNodes,
    ],
    edges: [
      { from: 'video', to: 'duration' },
      { from: 'video', to: 'summary' },
      ...tagNodes.map((node) => ({ from: 'video', to: node.id })),
    ],
  };
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

