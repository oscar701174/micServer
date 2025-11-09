import { Request, Response, Router } from "express";
import ytdl from "@distube/ytdl-core";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { convertToHLS, downloadAndConvertToHLS } from "./video.service1.js";
import { extractSegment } from "./video.service.js";

const router = Router();

const TMP_DIR = path.resolve("./tmp");
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

// 유효성 검사
function isYouTube(url: string): boolean {
    try {
        const u = new URL(url);
        return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname);
    } catch {
        return false;
    }
}

router.get('/', (req: Request, res: Response) => {
    res.send('Video route is working successfully!');
});

router.get('/play/:clipId', (req: Request, res: Response) => {
    const clipId = req.params.clipId;
    const playlistPath = path.join(TMP_DIR, 'hls', clipId, 'playlist.m3u8');
    
    if (!fs.existsSync(playlistPath)) {
        return res.status(404).json({ error: 'Playlist not found' });
    }

    // Return HTML5 video player
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Video Player</title>
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        </head>
        <body>
            <video id="video" controls style="width: 100%; max-width: 800px;"></video>
            <script>
                if(Hls.isSupported()) {
                    const video = document.getElementById('video');
                    const hls = new Hls();
                    hls.loadSource('/video/hls/${clipId}/playlist.m3u8');
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, function() {
                        video.play();
                    });
                }
            </script>
        </body>
        </html>
    `;
    
    res.send(html);
});


router.get('/downloadClip', async (req: Request, res: Response) => {
    const {url, start, end} = req.query;
    if (typeof url !== 'string' || typeof start !== 'string' || typeof end !== 'string') {
        return res.status(400).json({ error: "Missing or invalid parameters" });
    }
      const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;
  if (!youtubeRegex.test(url)) {
    return res.status(400).json({ error: "Only YouTube URLs are allowed" });
  }

try {
    const filePath = await extractSegment(url, start, end);
    res.status(200).json({
      message: "Segment downloaded successfully",
      file: filePath
    });
  } catch (err) {
    const error = err as Error;
    console.error("Download failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});


router.get('/downloadHlsClip', async (req: Request, res: Response) => {
    const {url, start, end} = req.query;
    if (typeof url !== 'string' || typeof start !== 'string' || typeof end !== 'string') {
        return res.status(400).json({ error: "Missing or invalid parameters" });
    }
      const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//;
  if (!youtubeRegex.test(url)) {
    return res.status(400).json({ error: "Only YouTube URLs are allowed" });
  }
  
try {   
    const filePath = await extractSegment(url, start, end);
    const m3u8Path = await convertToHLS(filePath);
    res.status(200).json({
      message: "Segment downloaded and converted to HLS successfully",
      m3u8Path: m3u8Path
    });
  } catch (err) {
    const error = err as Error;
    console.error("Download or conversion failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});



// 🎬 GET /video/download?url=... (yt-dlp 사용)
router.get('/download', async (req: Request, res: Response) => {
    const videoUrl = req.query.url as string;
    
    if (!videoUrl || !isYouTube(videoUrl)) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const id = Date.now().toString(36);
    const outputTemplate = path.join(TMP_DIR, `${id}.%(ext)s`);
    const args = [
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
        "--merge-output-format", "mp4",
        "-o", outputTemplate,
        videoUrl
    ];

    res.setHeader("Content-Type", "application/json");
    res.write(JSON.stringify({ status: "start", id }) + "\n");

    const proc = spawn("yt-dlp", args);

    let lastLine = "";
    proc.stdout.on("data", (data) => {
        const text = data.toString();
        lastLine = text.trim();
        console.log(text);
    });

    proc.stderr.on("data", (data) => console.error(data.toString()));

    proc.on("close", (code) => {
        if (code === 0) {
            // 파일 탐색
            const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(id));
            if (files.length > 0) {
                const filePath = path.join(TMP_DIR, files[0]);
                const stat = fs.statSync(filePath);
                res.write(JSON.stringify({
                    status: "done",
                    filename: files[0],
                    size: stat.size
                }) + "\n");
            } else {
                res.write(JSON.stringify({ status: "error", message: "no file" }) + "\n");
            }
        } else {
            res.write(JSON.stringify({ status: "error", message: "yt-dlp exited with code " + code }) + "\n");
        }
        res.end();
    });
});

// 💾 GET /video/file/:filename → mp4 직접 다운로드
router.get('/file/:filename', (req: Request, res: Response) => {
    const filename = req.params.filename;
    const filePath = path.join(TMP_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }
    
    res.download(filePath, filename, (err) => {
        if (!err) {
            console.log("served:", filename);
            // 필요 시 삭제
            // fs.unlinkSync(filePath);
        }
    });
});

// 🎥 GET /video/stream/:videoId → m3u8 스트리밍
router.get('/stream/:videoId', async (req: Request, res: Response) => {
    const videoId = req.params.videoId;
    const mp4Path = path.join(TMP_DIR, `${videoId}.mp4`);
    
    if (!fs.existsSync(mp4Path)) {
        return res.status(404).json({ error: "Video file not found" });
    }

    try {
        // MP4 → HLS 변환
        const m3u8Path = await convertToHLS(mp4Path);
        
        res.json({
            status: "success",
            message: "HLS conversion completed",
            m3u8Path: m3u8Path,
            playlistUrl: `/video/hls/${videoId}/playlist.m3u8`
        });
    } catch (error) {
        console.error("HLS conversion error:", error);
        res.status(500).json({ 
            error: "Failed to convert to HLS",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

// 📡 GET /video/hls/:videoId/playlist.m3u8 → HLS playlist 제공
router.get('/hls/:videoId/playlist.m3u8', (req: Request, res: Response) => {
    const videoId = req.params.videoId;
    const playlistPath = path.join(TMP_DIR, 'hls', videoId, 'playlist.m3u8');
    
    if (!fs.existsSync(playlistPath)) {
        return res.status(404).send("Playlist not found");
    }
    
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.sendFile(playlistPath);
});

// 📦 GET /video/hls/:videoId/:segment → HLS segment 제공
router.get('/hls/:videoId/:segment', (req: Request, res: Response) => {
    const { videoId, segment } = req.params;
    const segmentPath = path.join(TMP_DIR, 'hls', videoId, segment);
    
    if (!fs.existsSync(segmentPath)) {
        return res.status(404).send("Segment not found");
    }
    
    res.setHeader('Content-Type', 'video/MP2T');
    res.sendFile(segmentPath);
});

// 🚀 GET /video/direct?url=... → 다운로드 + HLS 변환 동시 처리
router.get('/direct', async (req: Request, res: Response) => {
    const videoUrl = req.query.url as string;
    
    if (!videoUrl || !isYouTube(videoUrl)) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const id = Date.now().toString(36);
    
    try {
        res.setHeader("Content-Type", "application/json");
        res.write(JSON.stringify({ status: "start", id }) + "\n");
        
        // 다운로드와 HLS 변환 동시 진행
        const m3u8Path = await downloadAndConvertToHLS(videoUrl, id);
        
        res.write(JSON.stringify({
            status: "done",
            id: id,
            playlistUrl: `/video/hls/${id}/playlist.m3u8`,
            m3u8Path: m3u8Path
        }) + "\n");
        res.end();
    } catch (error) {
        console.error("Direct conversion error:", error);
        res.write(JSON.stringify({ 
            status: "error", 
            message: error instanceof Error ? error.message : String(error)
        }) + "\n");
        res.end();
    }
});





export default router;