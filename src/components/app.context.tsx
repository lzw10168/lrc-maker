import LSK from "#const/local_key.json" assert { type: "json" };
import STRINGS from "#const/strings.json" assert { type: "json" };
import type { TrimOptios } from "@lrc-maker/lrc-parser";
import { createContext, useEffect, useMemo, useReducer, useRef } from "react";
import { useLang } from "../hooks/useLang.js";
import { type Action as PrefAction, type State as PrefState, usePref } from "../hooks/usePref.js";
import { toastPubSub } from "./toast.js";
import type { Language } from "../languages/index.js";
import enUS from "../languages/en-US.json" assert { type: "json" };

interface IAppContext {
    lang: Language;
    prefState: PrefState;
    prefDispatch: React.Dispatch<PrefAction>;
    trimOptions: Required<TrimOptios>;
}

const enum Bits {
    lang,
    // lrcFormat,
    builtInAudio,
    // screenButton,
    // themeColor,
    prefState,
}

export const enum ChangBits {
    lang = 1 << Bits.lang,
    // lrcFormat = 1 << Bits.lrcFormat,
    builtInAudio = 1 << Bits.builtInAudio,
    // screenButton = 1 << Bits.screenButton,
    // themeColor = 1 << Bits.themeColor,
    prefState = 1 << Bits.prefState,
    audioSrc = 1 << 3,
    trimOptions = 1 << 4,
    batchProcessor = 1 << 5,
}

type StringOptions = {
    spaceStart: number;
    spaceEnd: number;
    fixed: number;
};

export const appContext = createContext<{
    prefState: PrefState;
    prefDispatch: React.Dispatch<PrefAction>;
    lang: Language;
    audioSrc: string;
    setAudioSrc: (path: string) => any;
    trimOptions: StringOptions;
    // 批量处理状态
    batchProcessorState: {
        audioFiles: File[];
        lrcFiles: File[];
        matches: any[];
        processingIndex: number;
    };
    setBatchProcessorState: (state: any) => void;
}>(
    Object.create(null),
);

export const audioRef: React.RefObject<HTMLAudioElement> = {
    current: null,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const self = useRef(Symbol(AppProvider.name));

    const [prefState, prefDispatch] = usePref(() => {
        try {
            const data = localStorage.getItem(LSK.preferences);
            if (data) {
                return data;
            }
        } catch (e) {}

        return "";
    });

    const trimOptions = useMemo<StringOptions>(() => {
        const { spaceStart, spaceEnd, fixed } = prefState;
        return { spaceStart, spaceEnd, fixed };
    }, [prefState.spaceStart, prefState.spaceEnd, prefState.fixed]);

    const [lang, setLang] = useLang();

    const [audioSrc, setAudioSrc] = useReducer(
        (_state: string, action: string) => action,
        "",
    );

    // 添加批量处理状态
    const [batchProcessorState, setBatchProcessorState] = useReducer(
        (_state: any, action: any) => action,
        {
            audioFiles: [],
            lrcFiles: [],
            matches: [],
            processingIndex: -1,
        },
    );

    useEffect(() => {
        try {
            const data = localStorage.getItem(LSK.preferences);
            if (data) {
                const state = JSON.parse(data);
                if (prefState.lang !== state.lang) {
                    prefDispatch({
                        type: "lang", 
                        payload: state.lang,
                    });
                    setLang(state.lang).catch(console.error);
                }
            }
        } catch (e) {}
    }, [prefDispatch, prefState.lang, setLang]);

    useEffect(() => {
        if (lang && lang.app) {
            document.title = lang.app.fullname;
            document.documentElement.lang = prefState.lang;
        }
    }, [lang, prefState.lang]);

    const value = useMemo(() => {
        return {
            lang,
            prefState,
            prefDispatch,
            trimOptions,
            audioSrc,
            setAudioSrc,
            batchProcessorState,
            setBatchProcessorState,
        };
    }, [lang, prefDispatch, prefState, trimOptions, audioSrc, setAudioSrc, batchProcessorState, setBatchProcessorState]);

    return <appContext.Provider value={value}>{children}</appContext.Provider>;
};
