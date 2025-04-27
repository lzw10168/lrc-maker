import LSK from "#const/local_key.json" assert { type: "json" };
import ROUTER from "#const/router.json" assert { type: "json" };
import SSK from "#const/session_key.json" assert { type: "json" };
import { type State as LrcState, stringify, type TrimOptios } from "@lrc-maker/lrc-parser";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Action as LrcAction } from "../hooks/useLrc.js";
import { ActionType as LrcActionType } from "../hooks/useLrc.js";
import { createFile } from "../utils/gistapi.js";
import { lrcFileName } from "../utils/lrc-file-name.js";
import { prependHash } from "../utils/router.js";
import { appContext } from "./app.context.js";
import { CloudUploadSVG, CopySVG, DownloadSVG, OpenFileSVG, UtilitySVG } from "./svg.js";
import { toastPubSub } from "./toast.js";
import "./editor.css";
import { loadAudio } from '../utils/audiomodule.js';

const disableCheck = {
    autoCapitalize: "none",
    autoComplete: "off",
    autoCorrect: "off",
    spellCheck: false,
};

type HTMLInputLikeElement = HTMLInputElement & HTMLTextAreaElement;

type UseDefaultValue<T = React.RefObject<HTMLInputLikeElement>> = (
    defaultValue: string,
    ref?: T,
) => { defaultValue: string; ref: T };

const useDefaultValue: UseDefaultValue = (defaultValue, ref) => {
    const or = <T, K>(a: T, b: K): NonNullable<T> | K => a ?? b;

    const $ref = or(ref, useRef<HTMLInputLikeElement>(null));

    useEffect(() => {
        if ($ref.current) {
            $ref.current.value = defaultValue;
        }
    }, [defaultValue, $ref]);
    return { ref: $ref, defaultValue };
};

// 文件列表组件
const FileList: React.FC<{
    lrcDispatch: React.Dispatch<LrcAction>;
    trimOptions: {
        spaceStart: number;
        spaceEnd: number;
        fixed: number;
    };
}> = ({ lrcDispatch, trimOptions }) => {
    const { batchProcessorState, lang, setAudioSrc } = useContext(appContext);
    const { audioFiles, lrcFiles, matches } = batchProcessorState;
    
    const [activeTab, setActiveTab] = useState<'audio' | 'lrc' | 'matched'>('matched');
    
    // 加载歌词和音频文件
    const loadFiles = useCallback(async (lrcFile: File, audioFile?: File | null) => {
        try {
            // 1. 加载歌词
            const text = await lrcFile.text();
            console.log('text: ', text);
            
            if (!text || text.trim() === '') {
                toastPubSub.pub({
                    type: "warning",
                    text: "歌词文件内容为空，请重新上传有效的歌词文件。",
                });
                return;
            }
            
            // 将trimOptions转换为正确的TrimOptios格式
            const trimOpts: TrimOptios = {
                trimStart: trimOptions.spaceStart > 0,
                trimEnd: trimOptions.spaceEnd > 0
            };
            
            lrcDispatch({
                type: LrcActionType.parse,
                payload: { text, options: trimOpts },
            });
            
            // 2. 如果有音频文件，也加载它
            if (audioFile) {
                try {
                    
                    loadAudio(audioFile);
                    // 通知用户
                    toastPubSub.pub({
                        type: "success",
                        text: `${lrcFile.name} 和 ${audioFile.name} 已加载`,
                    });
                    
                    // 重定向到同步器页面以便用户可以立即开始同步
                    setTimeout(() => {
                        location.hash = ROUTER.synchronizer;
                    }, 1000);
                    
                   
                } catch (error) {
                    console.error("加载音频失败:", error);
                    toastPubSub.pub({
                        type: "warning",
                        text: `音频加载失败: ${error instanceof Error ? error.message : "未知错误"}`,
                    });
                }
            } else {
                // 仅加载了歌词
                toastPubSub.pub({
                    type: "success",
                    text: `${lrcFile.name} 已加载`,
                });
            }
            
        } catch (error) {
            toastPubSub.pub({
                type: "warning",
                text: `加载失败: ${error instanceof Error ? error.message : "未知错误"}`,
            });
        }
    }, [lrcDispatch, trimOptions, setAudioSrc]);
    
    // 为匹配项加载文件
    const loadMatchedFiles = useCallback((match: any) => {
        if (match.lrcFile) {
            // 加载歌词文件
            loadFiles(match.lrcFile, match.audioFile); // 只处理歌词，不让loadFiles处理音频
            
            // 单独处理音频文件（这个方法更可靠）
            // if (match.audioFile) {
            //     console.log("使用loadAudio加载音频:", match.audioFile.name);
            //     loadAudio(match.audioFile);
            // }
        }
    }, [loadFiles]);
    
    // 判断文件列表是否为空
    const isEmpty = 
        (activeTab === 'audio' && audioFiles.length === 0) || 
        (activeTab === 'lrc' && lrcFiles.length === 0) || 
        (activeTab === 'matched' && matches.length === 0);
    
    if (audioFiles.length === 0 && lrcFiles.length === 0 && matches.length === 0) {
        return (
            <div className="file-list-panel empty">
                <h3>批处理文件列表</h3>
                <p>还没有上传任何文件</p>
                <a href={prependHash(ROUTER.batchProcessor)} className="goto-batch-link">
                    前往批量处理页面
                </a>
            </div>
        );
    }
    
    return (
        <div className="file-list-panel">
            <h3>批处理文件列表</h3>
            
            <div className="file-list-tabs">
                <button 
                    className={`tab-button ${activeTab === 'matched' ? 'active' : ''}`}
                    onClick={() => setActiveTab('matched')}
                >
                    匹配文件 ({matches.length})
                </button>
                <button 
                    className={`tab-button ${activeTab === 'lrc' ? 'active' : ''}`}
                    onClick={() => setActiveTab('lrc')}
                >
                    歌词文件 ({lrcFiles.length})
                </button>
                <button 
                    className={`tab-button ${activeTab === 'audio' ? 'active' : ''}`}
                    onClick={() => setActiveTab('audio')}
                >
                    音频文件 ({audioFiles.length})
                </button>
            </div>
            
            {isEmpty ? (
                <p>没有{activeTab === 'audio' ? '音频' : activeTab === 'lrc' ? '歌词' : '匹配'}文件</p>
            ) : (
                <div className="file-list-items">
                    {activeTab === 'audio' && audioFiles.map((file, index) => (
                        <div key={`audio-${index}`} className="file-list-item">
                            <span className="file-name">{file.name}</span>
                        </div>
                    ))}
                    
                    {activeTab === 'lrc' && lrcFiles.map((file, index) => (
                        <div 
                            key={`lrc-${index}`} 
                            className="file-list-item clickable"
                            onClick={() => loadFiles(file)}
                        >
                            <span className="file-name">{file.name}</span>
                            <button className="load-button" onClick={(e) => { 
                                e.stopPropagation();
                                loadFiles(file);
                            }}>
                                加载
                            </button>
                        </div>
                    ))}
                    
                    {activeTab === 'matched' && matches.map((match, index) => (
                        <div 
                            key={`match-${index}`} 
                            className={`file-list-item ${match.lrcFile ? 'clickable' : ''}`}
                            onClick={() => match.lrcFile && loadMatchedFiles(match)}
                        >
                            <span className="file-name">{match.audioFile?.name || '未知音频'}</span>
                            {match.lrcFile ? (
                                <button 
                                    className="load-button"
                                    onClick={(e) => { 
                                        e.stopPropagation();
                                        loadMatchedFiles(match);
                                    }}
                                >
                                    加载歌词和音频
                                </button>
                            ) : (
                                <span className="status">未匹配</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
            
            <div className="file-list-footer">
                <a href={prependHash(ROUTER.batchProcessor)} className="goto-batch-link">
                    批量处理页面
                </a>
            </div>
        </div>
    );
};

export const Eidtor: React.FC<{
    lrcState: LrcState;
    lrcDispatch: React.Dispatch<LrcAction>;
}> = ({ lrcState, lrcDispatch }) => {
    const { prefState, lang, trimOptions } = useContext(appContext);
    const [showFileList, setShowFileList] = useState(true);

    const parse = useCallback(
        (ev: React.FocusEvent<HTMLTextAreaElement>) => {
            // 将trimOptions转换为正确的TrimOptios格式
            const trimOpts: TrimOptios = {
                trimStart: trimOptions.spaceStart > 0,
                trimEnd: trimOptions.spaceEnd > 0
            };
            
            lrcDispatch({
                type: LrcActionType.parse,
                payload: { text: ev.target.value, options: trimOpts },
            });
        },
        [lrcDispatch, trimOptions],
    );

    const setInfo = useCallback(
        (ev: React.FocusEvent<HTMLInputElement>) => {
            const { name, value } = ev.target;
            lrcDispatch({
                type: LrcActionType.info,
                payload: { name, value },
            });
        },
        [lrcDispatch],
    );

    const text = stringify(lrcState, prefState);

    const details = useRef<HTMLDetailsElement>(null);

    const onDetailsToggle = useCallback(() => {
        sessionStorage.setItem(SSK.editorDetailsOpen, details.current!.open.toString());
    }, []);

    const detailsOpened = useMemo(() => {
        return sessionStorage.getItem(SSK.editorDetailsOpen) !== "false";
    }, []);

    const textarea = useRef<HTMLInputLikeElement>(null);
    const [href, setHref] = useState<string | undefined>(undefined);

    const onDownloadClick = useCallback(() => {
        setHref((url) => {
            if (url) {
                URL.revokeObjectURL(url);
            }

            return URL.createObjectURL(
                new Blob([textarea.current!.value], {
                    type: "text/plain;charset=UTF-8",
                }),
            );
        });
    }, []);

    const onTextFileUpload = useCallback(
        (ev: React.ChangeEvent<HTMLInputElement>) => {
            if (ev.target.files === null || ev.target.files.length === 0) {
                return;
            }

            const fileReader = new FileReader();
            fileReader.addEventListener("load", () => {
                // 将trimOptions转换为正确的TrimOptios格式
                const trimOpts: TrimOptios = {
                    trimStart: trimOptions.spaceStart > 0,
                    trimEnd: trimOptions.spaceEnd > 0
                };
                
                lrcDispatch({
                    type: LrcActionType.parse,
                    payload: { text: fileReader.result as string, options: trimOpts },
                });
            });
            fileReader.readAsText(ev.target.files[0], "UTF-8");
        },
        [lrcDispatch, trimOptions],
    );

    const onCopyClick = useCallback(() => {
        textarea.current?.select();
        document.execCommand("copy");
    }, []);

    const downloadName = useMemo(() => lrcFileName(lrcState.info), [lrcState.info]);

    const canSaveToGist = useMemo(() => {
        return localStorage.getItem(LSK.token) !== null && localStorage.getItem(LSK.gistId) !== null;
    }, []);

    const onGistSave = useCallback(() => {
        setTimeout(() => {
            const name = prompt(lang.editor.saveFileName, downloadName);
            if (name) {
                createFile(name, textarea.current!.value).catch((error: Error) => {
                    toastPubSub.pub({
                        type: "warning",
                        text: error.message,
                    });
                });
            }
        }, 500);
    }, [downloadName, lang]);

    const toggleFileList = useCallback(() => {
        setShowFileList(prev => !prev);
        // 保存状态到sessionStorage
        sessionStorage.setItem('editorShowFileList', (!showFileList).toString());
    }, [showFileList]);

    // 从sessionStorage加载文件列表显示状态
    useEffect(() => {
        const savedState = sessionStorage.getItem('editorShowFileList');
        if (savedState !== null) {
            setShowFileList(savedState === 'true');
        }
    }, []);

    return (
        <div className={`app-editor ${showFileList ? 'with-file-list' : ''}`}>
            {showFileList && <FileList lrcDispatch={lrcDispatch} trimOptions={trimOptions} />}
            
            <button 
                className="toggle-file-list-button" 
                onClick={toggleFileList}
                title={showFileList ? "隐藏文件列表" : "显示文件列表"}
            >
                {showFileList ? '«' : '»'}
            </button>
            
            <div className="editor-main">
                <details ref={details} open={detailsOpened} onToggle={onDetailsToggle}>
                    <summary>{lang.editor.metaInfo}</summary>
                    <section className="app-editor-infobox" onBlur={setInfo}>
                        <label htmlFor="info-ti">[ti:</label>
                        <input
                            id="info-ti"
                            name="ti"
                            placeholder={lang.editor.title}
                            {...disableCheck}
                            {...useDefaultValue(lrcState.info.get("ti") || "")}
                        />
                        <label htmlFor="info-ti">]</label>
                        <label htmlFor="info-ar">[ar:</label>
                        <input
                            id="info-ar"
                            name="ar"
                            placeholder={lang.editor.artist}
                            {...disableCheck}
                            {...useDefaultValue(lrcState.info.get("ar") || "")}
                        />
                        <label htmlFor="info-ar">]</label>
                        <label htmlFor="info-al">[al:</label>
                        <input
                            id="info-al"
                            name="al"
                            placeholder={lang.editor.album}
                            {...disableCheck}
                            {...useDefaultValue(lrcState.info.get("al") || "")}
                        />
                        <label htmlFor="info-al">]</label>
                    </section>
                </details>

                <section className="editor-tools">
                    <label className="editor-tools-item ripple" title={lang.editor.uploadText}>
                        <input hidden={true} type="file" accept="text/*, .txt, .lrc" onChange={onTextFileUpload} />
                        <OpenFileSVG />
                    </label>
                    <button className="editor-tools-item ripple" title={lang.editor.copyText} onClick={onCopyClick}>
                        <CopySVG />
                    </button>
                    <a
                        className="editor-tools-item ripple"
                        title={lang.editor.downloadText}
                        href={href}
                        onClick={onDownloadClick}
                        download={downloadName}
                    >
                        <DownloadSVG />
                    </a>

                    <a
                        title={lang.editor.saveToGist}
                        href={canSaveToGist ? undefined : prependHash(ROUTER.gist)}
                        className="editor-tools-item ripple"
                        onClick={canSaveToGist ? onGistSave : undefined}
                    >
                        <CloudUploadSVG />
                    </a>

                    <a title={lang.editor.utils} href="/lrc-utils/" className="editor-tools-item ripple">
                        <UtilitySVG />
                    </a>
                </section>

                <textarea
                    className="app-textarea"
                    aria-label="lrc input here"
                    onBlur={parse}
                    {...disableCheck}
                    {...useDefaultValue(text, textarea)}
                />
            </div>
        </div>
    );
};
