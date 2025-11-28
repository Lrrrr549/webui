const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const cacheDir = path.join(rootDir, 'cache_videos');
const manifestPath = path.join(cacheDir, 'videos.json');

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, cacheDir),
  filename: (_, file, cb) => {
    const safeBase = slugify(file.originalname.replace(path.extname(file.originalname), ''));
    const ext = path.extname(file.originalname) || '.mp4';
    const filename = `${safeBase}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1_000_000_000 }, // ~1GB
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(rootDir));

app.get('/api/videos', async (_, res) => {
  try {
    const videos = await readManifest();
    res.json({ videos });
  } catch (error) {
    console.error('[GET /api/videos]', error);
    res.status(500).json({ error: '无法读取视频清单' });
  }
});

app.post('/api/videos', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传视频文件' });
    }

    const name = (req.body.name || req.file.originalname).trim();
    if (!name) {
      return res.status(400).json({ error: '视频名称不能为空' });
    }

    const summary = (req.body.summary || '').trim();
    const tags = parseTags(req.body.tags);
    const id = `${slugify(name)}-${Date.now()}`;
    const relativeSrc = `./cache_videos/${req.file.filename}`;

    const videos = await readManifest();
    const newVideo = {
      id,
      name,
      summary,
      tags,
      src: relativeSrc,
      uploadedAt: new Date().toISOString(),
    };

    videos.unshift(newVideo);
    await writeManifest(videos);

    res.status(201).json({ video: newVideo });
  } catch (error) {
    console.error('[POST /api/videos]', error);
    res.status(500).json({ error: '新增视频失败' });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const videos = await readManifest();
    const index = videos.findIndex((video) => video.id === id);
    if (index === -1) {
      return res.status(404).json({ error: '未找到对应视频' });
    }

    const [removed] = videos.splice(index, 1);
    await writeManifest(videos);
    await deleteVideoFile(removed.src);

    res.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/videos/:id]', error);
    res.status(500).json({ error: '删除视频失败' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

async function readManifest() {
  try {
    const payload = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed?.videos) ? parsed.videos : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeManifest([]);
      return [];
    }
    throw error;
  }
}

async function writeManifest(videos) {
  const payload = JSON.stringify({ videos }, null, 2);
  await fs.writeFile(manifestPath, payload, 'utf-8');
}

async function deleteVideoFile(src) {
  if (!src) return;
  const sanitized = src.replace(/^\.?\//, '');
  const filePath = path.join(rootDir, sanitized);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[deleteVideoFile]', error.message);
    }
  }
}

function slugify(value = '') {
  return value
    .toString()
    .normalize('NFKD')
    .replace(/[\u{0300}-\u{036f}]/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 48) || 'video';
}

function parseTags(rawTags) {
  if (!rawTags) return [];
  return rawTags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 10);
}

