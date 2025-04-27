import { guard } from "../hooks/useLrc.js";
import { createPubSub } from "./pubsub.js";
import SSK from "#const/session_key.json" assert { type: "json" };
import LSK from "#const/local_key.json" assert { type: "json" };
import { toastPubSub } from "../components/toast.js";
import { ActionType as LrcActionType } from "../hooks/useLrc.js";
import { setCurrentAudioFileName } from "./lrc-file-name.ts";

interface IAudioRef extends React.RefObject<HTMLAudioElement> {
    readonly src: string;
    readonly duration: number;
    readonly paused: boolean;
    playbackRate: number;
    currentTime: number;
    toggle: () => void;
    step: (
        ev: React.MouseEvent | React.KeyboardEvent | MouseEvent | KeyboardEvent,
        value: number,
        target?: number,
    ) => number;
}

export const audioRef: IAudioRef = {
    current: null,

    get src() {
        return this.current?.src ?? "";
    },

    get duration() {
        return this.current?.duration ?? 0;
    },

    get paused() {
        return this.current?.paused ?? true;
    },

    get playbackRate() {
        return this.current?.playbackRate ?? 1;
    },
    set playbackRate(rate: number) {
        if (this.current !== null) {
            this.current.playbackRate = rate;
        }
    },

    get currentTime() {
        return this.current?.currentTime ?? 0;
    },
    set currentTime(time: number) {
        if (this.current !== null && this.current.duration !== 0) {
            this.current.currentTime = time;
        }
    },

    step(ev, value, target): number {
        if (target === undefined) {
            target = this.currentTime;
        }

        if (ev.altKey) {
            value *= 0.2;
        }
        if (ev.shiftKey) {
            value *= 0.5;
        }
        return (this.currentTime = guard(value + target, 0, this.duration));
    },

    toggle() {
        if (this.current?.duration) {
            void (this.current.paused ? this.current.play() : this.current.pause());
        }
    },
};

export const enum AudioActionType {
    pause,
    getDuration,
    rateChange,
    loadAudio,
    loadLyric,
}

export type AudioState =
    | {
        type: AudioActionType.pause;
        payload: boolean;
    }
    | {
        type: AudioActionType.getDuration;
        payload: number;
    }
    | {
        type: AudioActionType.rateChange;
        payload: number;
    }
    | {
        type: AudioActionType.loadAudio;
        payload: string;
    }
    | {
        type: AudioActionType.loadLyric;
        payload: string;
    };

export const audioStatePubSub = createPubSub<AudioState>();
export const currentTimePubSub = createPubSub<number>();

// Audio magic number detection
const MimeType = {
    fLaC: 0x664c6143,
    OggS: 0x4f676753,
    RIFF: 0x52494646,
    WAVE: 0x57415645,
};

// Detect mime type from audio data
const detectMimeType = (dataArray: Uint8Array) => {
    const magicNumber = new DataView(dataArray.buffer).getUint32(0, false);
    switch (magicNumber) {
        case MimeType.fLaC:
            return "audio/flac";
        case MimeType.OggS:
            return "audio/ogg";
        case MimeType.RIFF:
        case MimeType.WAVE:
            return "audio/wav";
        default:
            return "audio/mpeg";
    }
};

// Global function to load audio files
export const loadAudio = (file: File): void => {
    console.log("Loading audio file:", file.name);
    
    if (file) {
        // Store the audio filename for LRC naming
        setCurrentAudioFileName(file.name);
        
        // Standard audio file
        if (file.type.startsWith("audio/") || 
            file.name.endsWith(".mp3") || 
            file.name.endsWith(".wav") || 
            file.name.endsWith(".flac") ||
            file.name.endsWith(".ogg") || 
            file.name.endsWith(".m4a")) {
            
            const audioUrl = URL.createObjectURL(file);
            console.log("Created audio URL:", audioUrl);
            
            // 直接设置 audioRef 的 src
            if (audioRef.current) {
                URL.revokeObjectURL(audioRef.current.src);
                audioRef.current.src = audioUrl;
                audioRef.current.load();
                console.log("Set audio src directly");
            }
            
            // 存储在 sessionStorage 中
            sessionStorage.setItem(SSK.audioSrc, audioUrl);
            
            // 通过事件系统通知其他组件
            audioStatePubSub.pub({
                type: AudioActionType.loadAudio,
                payload: audioUrl,
            });
            
            return;
        }
        
        // NCM format
        if (file.name.endsWith(".ncm")) {
            const worker = new Worker(new URL("/worker/ncmc-worker.js", import.meta.url));
            worker.addEventListener(
                "message",
                (ev: MessageEvent<any>) => {
                    if (ev.data.type === "success") {
                        const dataArray = ev.data.payload;
                        const musicFile = new Blob([dataArray], {
                            type: detectMimeType(dataArray),
                        });

                        const audioUrl = URL.createObjectURL(musicFile);
                        sessionStorage.setItem(SSK.audioSrc, audioUrl);
                        audioStatePubSub.pub({
                            type: AudioActionType.loadAudio,
                            payload: audioUrl,
                        });
                    }
                    if (ev.data.type === "error") {
                        toastPubSub.pub({
                            type: "warning",
                            text: ev.data.payload,
                        });
                    }
                },
                { once: true },
            );

            worker.addEventListener(
                "error",
                (ev) => {
                    toastPubSub.pub({
                        type: "warning",
                        text: ev.message,
                    });
                    worker.terminate();
                },
                { once: true },
            );

            worker.postMessage(file);
            return;
        }
        
        // QMC format
        if (/\.qmc(?:flac|0|1|2|3)$/.test(file.name)) {
            const worker = new Worker(new URL("/worker/qmc-worker.js", import.meta.url));
            worker.addEventListener(
                "message",
                (ev: MessageEvent<any>) => {
                    if (ev.data.type === "success") {
                        const dataArray = ev.data.payload;
                        const musicFile = new Blob([dataArray], {
                            type: detectMimeType(dataArray),
                        });

                        const audioUrl = URL.createObjectURL(musicFile);
                        sessionStorage.setItem(SSK.audioSrc, audioUrl);
                        audioStatePubSub.pub({
                            type: AudioActionType.loadAudio,
                            payload: audioUrl,
                        });
                    }
                },
                { once: true },
            );

            worker.postMessage(file);
        }
    }
};

// Global function to load lyrics
export const loadLyric = (lrcText: string): void => {
    // 保存歌词到本地存储
    localStorage.setItem(LSK.lyric, lrcText);
    
    // 发布加载歌词事件
    audioStatePubSub.pub({
        type: AudioActionType.loadLyric,
        payload: lrcText,
    });
};
