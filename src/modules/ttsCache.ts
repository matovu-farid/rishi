import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import md5 from "md5";
import { PUBLIC, TTS_CACHE } from "./epub_constants";

export interface CachedAudioInfo {
  filePath: string;
  path: string;
  exists: boolean;
}

/**
 * TTS Cache Manager
 * Handles caching of generated audio files for text-to-speech functionality
 */
export class TTSCache {
  private cacheDir: string = "";
  private readonly MAX_CACHE_SIZE_MB = 500; // 500MB limit
  private readonly CACHE_CLEANUP_THRESHOLD = 0.8; // Cleanup when 80% full

  constructor() {
    this.init();
  }
  async init() {
    this.cacheDir = await path.join(await path.appDataDir(), PUBLIC, TTS_CACHE);
    this.ensurePublicDir();
  }

  /**
   * Ensure the public directory exists for Express server
   */
  private async ensurePublicDir(): Promise<void> {
    const publicDir = await path.join(await path.appDataDir(), PUBLIC);

    try {
      await fs.mkdir(publicDir, { recursive: true });
      console.log("Public directory ensured at:", publicDir);
    } catch (error) {
      console.error("Failed to create public directory:", error);
      throw new Error(`Failed to create public directory: ${error}`);
    }
  }

  /**
   * Get the cache directory path for a specific book
   */
  private getBookCacheDir(bookId: string): Promise<string> {
    return path.join(this.cacheDir, bookId);
  }

  /**
   * Get the file path for a cached audio file
   */
  private async getAudioFilePath(
    bookId: string,
    cfiRange: string
  ): Promise<string> {
    const bookCacheDir = await this.getBookCacheDir(bookId);
    const hashedCfi = md5(cfiRange);
    return path.join(bookCacheDir, `${hashedCfi}.mp3`);
  }

  /**
   * Get the HTTP URL for a cached audio file
   */
  private async getAudioPath(
    bookId: string,
    cfiRange: string
  ): Promise<string> {
    const hashedCfi = md5(cfiRange);
    return await path.join(
      await path.appDataDir(),
      PUBLIC,
      TTS_CACHE,
      bookId,
      `${hashedCfi}.mp3`
    );
  }

  /**
   * Check if audio is cached for a given CFI range
   */
  async getCachedAudio(
    bookId: string,
    cfiRange: string
  ): Promise<CachedAudioInfo> {
    const filePath = await this.getAudioFilePath(bookId, cfiRange);
    const path = await this.getAudioPath(bookId, cfiRange);

    try {
      await fs.exists(filePath);
      return { filePath, path: path, exists: true };
    } catch {
      return { filePath, path: path, exists: false };
    }
  }

  /**
   * Save generated audio to cache
   */
  async saveCachedAudio(
    bookId: string,
    cfiRange: string,
    audioBuffer: Buffer
  ): Promise<string> {
    try {
      const filePath = await this.getAudioFilePath(bookId, cfiRange);
      const bookCacheDir = await this.getBookCacheDir(bookId);
      const path = await this.getAudioPath(bookId, cfiRange);

      console.log("Saving TTS audio:");
      console.log("  Book ID:", bookId);
      console.log("  CFI Range:", cfiRange);
      console.log("  File Path:", filePath);
      console.log("  Path:", path);
      console.log("  Cache Dir:", this.cacheDir);

      // Ensure book cache directory exists
      await fs.mkdir(bookCacheDir, { recursive: true });

      // Check cache size before saving
      await this.checkAndCleanupCache();

      // Save audio buffer to file
      await fs.writeFile(filePath, new Uint8Array(audioBuffer));

      // Verify file was created
      const stats = await fs.stat(filePath);
      console.log("File created successfully:", {
        path: filePath,
        size: stats.size,
      });

      return path;
    } catch (error) {
      console.error("Failed to save cached audio:", error);
      throw new Error(`Failed to save cached audio: ${error}`);
    }
  }

  /**
   * Remove cached audio for a specific CFI range
   */
  async removeCachedAudio(bookId: string, cfiRange: string): Promise<void> {
    const filePath = await this.getAudioFilePath(bookId, cfiRange);

    try {
      await fs.remove(filePath);
    } catch (error) {
      // File doesn't exist or couldn't be deleted - ignore
      console.warn(`Could not remove cached audio: ${error}`);
    }
  }

  /**
   * Clear all cached audio for a book
   */
  async clearBookCache(bookId: string): Promise<void> {
    const bookCacheDir = await this.getBookCacheDir(bookId);

    try {
      await fs.remove(bookCacheDir, { recursive: true });
    } catch (error) {
      console.warn(`Could not clear book cache: ${error}`);
    }
  }

  /**
   * Get cache size for a book (in bytes)
   */
  async getBookCacheSize(bookId: string): Promise<number> {
    const bookCacheDir = await this.getBookCacheDir(bookId);

    try {
      const files = await fs.readDir(bookCacheDir);

      let totalSize = 0;

      for (const file of files) {
        const filePath = await path.join(bookCacheDir, file.name);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Get total cache size (in bytes)
   */
  async getTotalCacheSize(): Promise<number> {
    try {
      let totalSize = 0;
      const entries = await fs.readDir(this.cacheDir);

      for (const entry of entries) {
        if (entry.isDirectory) {
          totalSize += await this.getBookCacheSize(entry.name);
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  /**
   * Check cache size and cleanup if necessary
   */
  private async checkAndCleanupCache(): Promise<void> {
    try {
      const totalSizeBytes = await this.getTotalCacheSize();
      const totalSizeMB = totalSizeBytes / (1024 * 1024);

      if (totalSizeMB > this.MAX_CACHE_SIZE_MB * this.CACHE_CLEANUP_THRESHOLD) {
        console.log(
          `Cache size (${totalSizeMB.toFixed(2)}MB) exceeds threshold, cleaning up...`
        );
        await this.cleanupOldestFiles();
      }
    } catch (error) {
      console.error("Failed to check cache size:", error);
    }
  }

  /**
   * Clean up oldest files to free space
   */
  private async cleanupOldestFiles(): Promise<void> {
    try {
      const entries = await fs.readDir(this.cacheDir);
      const fileStats: Array<{ path: string; mtime: Date }> = [];

      // Collect all files with their modification times
      for (const entry of entries) {
        const entryPath = await path.join(this.cacheDir, entry.name);

        if (entry.isDirectory) {
          const bookFiles = await fs.readDir(entryPath);
          for (const file of bookFiles) {
            const filePath = await path.join(entryPath, file.name);
            const fileStats_info = await fs.stat(filePath);
            fileStats.push({
              path: filePath,
              mtime: fileStats_info.mtime ?? new Date(),
            });
          }
        }
      }

      // Sort by modification time (oldest first)
      fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      // Remove oldest files until we're under the threshold
      const targetSizeBytes =
        this.MAX_CACHE_SIZE_MB * this.CACHE_CLEANUP_THRESHOLD * 1024 * 1024;
      let currentSize = await this.getTotalCacheSize();

      for (const fileStat of fileStats) {
        if (currentSize <= targetSizeBytes) break;

        try {
          const fileSize = (await fs.stat(fileStat.path)).size;
          await fs.remove(fileStat.path);
          currentSize -= fileSize;
          console.log(`Removed old cache file: ${fileStat.path}`);
        } catch (error) {
          console.warn(`Failed to remove cache file ${fileStat.path}:`, error);
        }
      }
    } catch (error) {
      console.error("Failed to cleanup cache files:", error);
    }
  }
}

// Export singleton instance
export const ttsCache = new TTSCache();
