import { execFile, ExecFileException } from "child_process";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf8" }, (error: ExecFileException | null, stdout: string, stderr: string) => {
      if (error) return reject(new Error(stderr || error.message));
      if (stderr) console.warn(stderr);
      resolve({ stdout, stderr });
    });
  });
}

async function checkYtDlp(): Promise<boolean> {
  try {
    await execFileAsync("yt-dlp", ["--version"]);
    return true;
  } catch {
    console.error("yt-dlp is not installed.");
    return false;
  }
}

export async function extractSegment(url: string, start: string, end: string): Promise<string> {
  if (!await checkYtDlp()) throw new Error("yt-dlp is not installed");

  const outputDir = path.join(__dirname, "../../downloads");
  await fs.mkdir(outputDir, { recursive: true });

  const timestamp = Date.now();
  const tempFile = path.join(outputDir, `temp_${timestamp}.mp4`);
  const outputFile = path.join(outputDir, `clip_${timestamp}.mp4`);

  // Step 1️⃣ yt-dlp 전체 다운로드
  console.log("▶ Downloading full video...");
  await execFileAsync("yt-dlp", [
    "-f", "bestvideo+bestaudio/best",
    "--merge-output-format", "mp4",
    "-o", tempFile,
    url
  ]);

  // Step 2️⃣ ffmpeg 구간 자르기
  console.log("✂ Cutting segment...");
  await execFileAsync("ffmpeg", [
    "-ss", start,
    "-to", end,
    "-i", tempFile,
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    "-y", outputFile
  ]);

  // Step 3️⃣ 결과 확인
  const exists = await fs.access(outputFile).then(() => true).catch(() => false);
  if (!exists) throw new Error("Output file was not created");

  console.log("✅ Segment extraction complete:", outputFile);
  return outputFile;
}

