import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Convert downloaded video to HLS (m3u8) format
 * @param inputPath - Path to the input video file (e.g., tmp/12345.mp4)
 * @param outputDir - Directory to save HLS output files (default: tmp/hls)
 * @returns Promise with output m3u8 file path
 */

export async function convertToHLS(
    inputPath: string,
    outputDir: string = path.join('tmp', 'hls')
): Promise<string> {
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    const videoId = path.basename(inputPath, path.extname(inputPath));
    const hlsDir = path.join(outputDir, videoId);
    await fs.mkdir(hlsDir, { recursive: true });

    const outputPath = path.join(hlsDir, 'playlist.m3u8');

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoCodec('libx264')              // H.264 encoding for compatibility
            .audioCodec('aac')                  // AAC audio for compatibility
            .outputOptions([
                '-preset', 'veryfast',          // Fast encoding
                '-crf', '23',                   // Quality (lower = better, 18-28 range)
                '-start_number', '0',
                '-hls_time', '10',
                '-hls_list_size', '0',
                '-hls_segment_filename', path.join(hlsDir, 'segment%d.ts'),
                '-f', 'hls'
            ])
            .output(outputPath)
            .on('start', (commandLine) => {
                console.log('FFmpeg process started:', commandLine);
            })
            .on('progress', (progress) => {
                console.log(`Processing: ${progress.percent?.toFixed(2)}% done`);
            })
            .on('end', () => {
                console.log('HLS conversion completed:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * Convert downloaded video to HLS with transcoding for better compatibility
 * @param inputPath - Path to the input video file
 * @param outputDir - Directory to save HLS output files
 * @param quality - Video quality preset ('high' | 'medium' | 'low')
 * @returns Promise with output m3u8 file path
 */
export async function convertToHLSWithTranscode(
    inputPath: string,
    outputDir: string = path.join('tmp', 'hls'),
    quality: 'high' | 'medium' | 'low' = 'medium'
): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });

    const videoId = path.basename(inputPath, path.extname(inputPath));
    const hlsDir = path.join(outputDir, videoId);
    await fs.mkdir(hlsDir, { recursive: true });

    const outputPath = path.join(hlsDir, 'playlist.m3u8');

    // Quality presets
    const qualitySettings = {
        high: { videoBitrate: '5000k', audioBitrate: '192k', scale: '1920:1080' },
        medium: { videoBitrate: '2500k', audioBitrate: '128k', scale: '1280:720' },
        low: { videoBitrate: '1000k', audioBitrate: '96k', scale: '854:480' }
    };

    const settings = qualitySettings[quality];

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .videoBitrate(settings.videoBitrate)
            .audioBitrate(settings.audioBitrate)
            .size(settings.scale)
            .outputOptions([
                '-start_number', '0',
                '-hls_time', '10',
                '-hls_list_size', '0',
                '-f', 'hls',
                '-preset', 'fast'               // Encoding speed preset
            ])
            .output(outputPath)
            .on('start', (commandLine) => {
                console.log('FFmpeg transcoding started:', commandLine);
            })
            .on('progress', (progress) => {
                console.log(`Transcoding: ${progress.percent?.toFixed(2)}% done`);
            })
            .on('end', () => {
                console.log('HLS transcoding completed:', outputPath);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * Download YouTube video and convert directly to HLS format
 * @param videoUrl - YouTube video URL
 * @param videoId - Unique identifier for the video
 * @param hlsDir - Directory to save HLS output files (default: tmp/hls)
 * @returns Promise with output m3u8 file path
 */
export async function downloadAndConvertToHLS(
    videoUrl: string,
    videoId: string,
    hlsDir: string = path.join('tmp', 'hls')
): Promise<string> {
    const tmpDir = path.join('tmp');
    const outputDir = path.join(hlsDir, videoId);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment%d.ts');
    const tempVideoPath = path.join(tmpDir, `${videoId}_temp.mp4`);

    return new Promise((resolve, reject) => {
        // Step 1: yt-dlp로 임시 파일 다운로드
        const ytdlp = spawn('yt-dlp', [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '-o', tempVideoPath,
            videoUrl
        ]);

        ytdlp.stderr.on('data', (data) => {
            console.log('yt-dlp:', data.toString());
        });

        ytdlp.on('error', (err) => {
            console.error('yt-dlp error:', err);
            reject(err);
        });

        ytdlp.on('close', async (code) => {
            if (code !== 0) {
                reject(new Error(`yt-dlp exited with code ${code}`));
                return;
            }

            // Step 2: ffmpeg로 HLS 변환
            const ffmpegArgs = [
                '-i', tempVideoPath,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'veryfast',
                '-crf', '23',
                '-sc_threshold', '0',
                '-g', '48',
                '-keyint_min', '48',
                '-hls_time', '10',
                '-hls_list_size', '0',
                '-hls_segment_filename', segmentPattern,
                '-f', 'hls',
                playlistPath
            ];

            const ffmpegProc = spawn(ffmpegPath || 'ffmpeg', ffmpegArgs);

            ffmpegProc.stdout.on('data', (data) => {
                console.log('ffmpeg:', data.toString());
            });

            ffmpegProc.stderr.on('data', (data) => {
                console.log('ffmpeg:', data.toString());
            });

            ffmpegProc.on('error', (err) => {
                console.error('ffmpeg error:', err);
                // 임시 파일 삭제
                fs.unlink(tempVideoPath).catch(() => {});
                reject(err);
            });

            ffmpegProc.on('close', async (ffmpegCode) => {
                // 임시 파일 삭제
                try {
                    await fs.unlink(tempVideoPath);
                } catch (err) {
                    console.error('Failed to delete temp file:', err);
                }

                if (ffmpegCode === 0) {
                    console.log('Direct HLS conversion completed:', playlistPath);
                    resolve(playlistPath);
                } else {
                    reject(new Error(`ffmpeg exited with code ${ffmpegCode}`));
                }
            });
        });
    });
}
