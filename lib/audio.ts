"use client";

import { BACKEND_URL } from "@/lib/api";

export interface AudioStreamHandlers {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (err: Error) => void;
}

/**
 * LiveAudioSession — records audio via MediaRecorder and streams it to the
 * backend over WebSocket. The backend transcribes the complete recording
 * via AssemblyAI (or Gemini fallback) and sends back the final text.
 *
 * Flow:
 * 1. start() — opens WebSocket, starts MediaRecorder
 * 2. Chunks are sent to backend as they arrive
 * 3. stop() — sends "END_SPEECH", waits for the "final" response, then closes
 */
export class LiveAudioSession {
  private bubbleId: string;
  private userId: string;
  private userName: string;
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private handlers: AudioStreamHandlers;
  private isRecording = false;
  private finalReceived = false;

  constructor(
    bubbleId: string,
    userId: string,
    userName: string,
    handlers: AudioStreamHandlers
  ) {
    this.bubbleId = bubbleId;
    this.userId = userId;
    this.userName = userName;
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Build WebSocket URL
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = BACKEND_URL.replace(/^https?:\/\//, "");
      const wsUrl = `${wsProtocol}//${host}/api/v1/bubbles/${this.bubbleId}/audio?user_id=${encodeURIComponent(
        this.userId
      )}&user_name=${encodeURIComponent(this.userName)}`;

      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = "arraybuffer";

      // Handle messages from backend (partial + final transcripts)
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "partial" && data.text) {
            this.handlers.onPartial?.(data.text);
          } else if (data.type === "final") {
            this.finalReceived = true;
            this.handlers.onFinal?.(data.text || "");
            // Close the WebSocket after receiving the final transcript
            this.cleanup();
          }
        } catch {
          // Ignored
        }
      };

      this.ws.onerror = (e) => {
        this.handlers.onError?.(new Error("Audio WebSocket connection error"));
      };

      // Wait for WebSocket to open before starting recording
      await new Promise<void>((resolve, reject) => {
        if (!this.ws) return reject(new Error("No WebSocket"));
        this.ws.onopen = () => resolve();
        this.ws.onclose = () => resolve(); // graceful — proceed even if already closed
        setTimeout(() => resolve(), 2000); // timeout fallback
      });

      // Start MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          const buffer = await e.data.arrayBuffer();
          this.ws.send(buffer);
        }
      };

      this.mediaRecorder.start(500); // Emit chunks every 500ms
      this.isRecording = true;
    } catch (err: unknown) {
      this.cleanup();
      throw err;
    }
  }

  stop(): void {
    if (!this.isRecording) return;
    this.isRecording = false;

    // Stop MediaRecorder (this triggers a final ondataavailable with the last chunk)
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    // Tell the backend to transcribe the full buffer
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send("END_SPEECH");
      } catch {
        // Ignored
      }
    }

    // Show "Transcribing..." while waiting for the backend's final response
    this.handlers.onPartial?.("Transcribing...");

    // Safety timeout — if the backend doesn't respond within 90s, close and show empty result
    setTimeout(() => {
      if (!this.finalReceived) {
        this.handlers.onFinal?.("");
        this.cleanup();
      }
    }, 90000);
  }

  private cleanup(): void {
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== "inactive") {
          this.mediaRecorder.stop();
        }
      } catch {
        // Ignored
      }
      this.mediaRecorder = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // Ignored
      }
      this.ws = null;
    }
    this.isRecording = false;
  }
}
