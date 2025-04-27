import * as React from "react";
import { useState, useCallback, useRef, useEffect, useContext } from "react";
import "./batch-processor.css";
import { appContext } from "./app.context";
import { loadAudio, loadLyric } from "../utils/audiomodule";

// 移除localStorage键常量
// const BATCH_PROCESSOR_STORAGE_KEY = "lrc_maker_batch_processor_state";

interface FileMatch {
    audioFile: File | null;
    lrcFile: File | null;
    matchConfidence: number; // 0-100
    status: "matched" | "unmatched" | "processed" | "error";
    result?: string;
    error?: string;
}

interface BestMatch {
    file: File;
    confidence: number;
}

// 扩展HTML Input元素的类型定义，添加webkitdirectory属性
declare module "react" {
    interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
        // 添加webkitdirectory属性
        webkitdirectory?: string;
        directory?: string;
    }
}

// 移除不需要的序列化状态类型
// interface SerializableState {
//     audioFileNames: string[];
//     lrcFileNames: string[];
// }

export const BatchProcessor: React.FC = () => {
    const { batchProcessorState, setBatchProcessorState } = useContext(appContext);
    const { audioFiles, lrcFiles, matches, processingIndex } = batchProcessorState;
    
    const [processing, setProcessing] = useState(false);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const lrcInputRef = useRef<HTMLInputElement>(null);
    const audioDirInputRef = useRef<HTMLInputElement>(null);
    const lrcDirInputRef = useRef<HTMLInputElement>(null);
    const tempAudioRef = useRef<HTMLAudioElement>(null);
    
    // 移除从localStorage加载状态的useEffect
    // useEffect(() => {
    //     try {
    //         const savedState = localStorage.getItem(BATCH_PROCESSOR_STORAGE_KEY);
    //         if (savedState && audioFiles.length === 0 && lrcFiles.length === 0) {
    //             const state = JSON.parse(savedState) as SerializableState;
    //             console.info('Loaded batch processor state', state);
                
    //             // 我们不能直接保存File对象到localStorage，只能保存文件名
    //             // 只有UI显示需要，所以这里仅恢复文件名的显示
    //             if (state.audioFileNames && state.audioFileNames.length > 0) {
    //                 const audioFiles: File[] = state.audioFileNames.map(name => 
    //                     new File([], name, { type: 'audio/mock' })
    //                 );
    //                 updateAudioFiles(audioFiles);
    //             }
                
    //             if (state.lrcFileNames && state.lrcFileNames.length > 0) {
    //                 const lrcFiles: File[] = state.lrcFileNames.map(name => 
    //                     new File([], name, { type: 'text/plain' })
    //                 );
    //                 updateLrcFiles(lrcFiles);
    //             }
    //         }
    //     } catch (e) {
    //         console.error('Failed to load batch processor state', e);
    //     }
    // }, []);
    
    // 移除保存状态到localStorage的useEffect
    // useEffect(() => {
    //     try {
    //         // 只保存文件名，因为File对象不能序列化
    //         const state: SerializableState = {
    //             audioFileNames: audioFiles.map(file => file.name),
    //             lrcFileNames: lrcFiles.map(file => file.name)
    //         };
    //         localStorage.setItem(BATCH_PROCESSOR_STORAGE_KEY, JSON.stringify(state));
    //     } catch (e) {
    //         console.error('Failed to save batch processor state', e);
    //     }
    // }, [audioFiles, lrcFiles]);

    // 更新状态的辅助函数
    const updateAudioFiles = (files: File[]) => {
        setBatchProcessorState({
            ...batchProcessorState,
            audioFiles: files
        });
    };

    const updateLrcFiles = (files: File[]) => {
        setBatchProcessorState({
            ...batchProcessorState,
            lrcFiles: files
        });
    };

    const updateMatches = (newMatches: FileMatch[]) => {
        setBatchProcessorState({
            ...batchProcessorState,
            matches: newMatches
        });
    };

    const updateProcessingIndex = (index: number) => {
        setBatchProcessorState({
            ...batchProcessorState,
            processingIndex: index
        });
    };

    // 处理文件上传
    const handleAudioUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files).filter(file => 
                file.type.startsWith("audio/") || file.name.endsWith(".mp3") || 
                file.name.endsWith(".wav") || file.name.endsWith(".flac") ||
                file.name.endsWith(".ogg") || file.name.endsWith(".m4a"));
            updateAudioFiles([...audioFiles, ...files]);
        }
    }, [audioFiles, batchProcessorState]);

    const handleLrcUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files).filter(file => 
                file.name.endsWith(".lrc") || file.name.endsWith(".txt"));
            updateLrcFiles([...lrcFiles, ...files]);
        }
    }, [lrcFiles, batchProcessorState]);

    // 处理文件夹上传
    const handleAudioFolderUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files).filter(file => 
                file.type.startsWith("audio/") || file.name.endsWith(".mp3") || 
                file.name.endsWith(".wav") || file.name.endsWith(".flac") ||
                file.name.endsWith(".ogg") || file.name.endsWith(".m4a"));
            updateAudioFiles([...audioFiles, ...files]);
        }
    }, [audioFiles, batchProcessorState]);

    const handleLrcFolderUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files).filter(file => 
                file.name.endsWith(".lrc") || file.name.endsWith(".txt"));
            updateLrcFiles([...lrcFiles, ...files]);
        }
    }, [lrcFiles, batchProcessorState]);

    // 文件拖放处理
    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault();
        event.currentTarget.classList.add("drag-over");
    };

    const handleDragLeave = (event: React.DragEvent) => {
        event.currentTarget.classList.remove("drag-over");
    };

    const handleAudioDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.currentTarget.classList.remove("drag-over");
        
        // 检查是否包含文件夹
        const items = event.dataTransfer.items;
        if (items && items.length > 0) {
            // 处理webkitGetAsEntry API，支持文件夹导入
            const processEntry = (entry: any) => {
                if (entry.isFile) {
                    entry.file((file: File) => {
                        if (file.type.startsWith("audio/") || file.name.endsWith(".mp3") || 
                            file.name.endsWith(".wav") || file.name.endsWith(".flac") ||
                            file.name.endsWith(".ogg") || file.name.endsWith(".m4a")) {
                            updateAudioFiles([...audioFiles, file]);
                        }
                    });
                } else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    reader.readEntries((entries: any[]) => {
                        entries.forEach(processEntry);
                    });
                }
            };
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // 安全地访问webkitGetAsEntry方法
                if (typeof item.webkitGetAsEntry === 'function') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        processEntry(entry);
                    }
                }
            }
        } else if (event.dataTransfer.files) {
            // 兼容处理普通文件拖拽
            const files = Array.from(event.dataTransfer.files).filter(file => 
                file.type.startsWith("audio/") || file.name.endsWith(".mp3") || 
                file.name.endsWith(".wav") || file.name.endsWith(".flac") ||
                file.name.endsWith(".ogg") || file.name.endsWith(".m4a"));
            updateAudioFiles([...audioFiles, ...files]);
        }
    }, [audioFiles, batchProcessorState]);

    const handleLrcDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.currentTarget.classList.remove("drag-over");
        
        // 检查是否包含文件夹
        const items = event.dataTransfer.items;
        if (items && items.length > 0) {
            // 处理webkitGetAsEntry API，支持文件夹导入
            const processEntry = (entry: any) => {
                if (entry.isFile) {
                    entry.file((file: File) => {
                        if (file.name.endsWith(".lrc") || file.name.endsWith(".txt")) {
                            updateLrcFiles([...lrcFiles, file]);
                        }
                    });
                } else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    reader.readEntries((entries: any[]) => {
                        entries.forEach(processEntry);
                    });
                }
            };
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // 安全地访问webkitGetAsEntry方法
                if (typeof item.webkitGetAsEntry === 'function') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        processEntry(entry);
                    }
                }
            }
        } else if (event.dataTransfer.files) {
            // 兼容处理普通文件拖拽
            const files = Array.from(event.dataTransfer.files).filter(file => 
                file.name.endsWith(".lrc") || file.name.endsWith(".txt"));
            updateLrcFiles([...lrcFiles, ...files]);
        }
    }, [lrcFiles, batchProcessorState]);

    // 清除所有文件
    const clearFiles = useCallback(() => {
        setBatchProcessorState({
            audioFiles: [],
            lrcFiles: [],
            matches: [],
            processingIndex: -1
        });
        setProcessing(false);
        
        // 移除本地存储清理代码
        // localStorage.removeItem(BATCH_PROCESSOR_STORAGE_KEY);
        
        if (audioInputRef.current) {
            audioInputRef.current.value = "";
        }
        
        if (lrcInputRef.current) {
            lrcInputRef.current.value = "";
        }

        if (audioDirInputRef.current) {
            audioDirInputRef.current.value = "";
        }
        
        if (lrcDirInputRef.current) {
            lrcDirInputRef.current.value = "";
        }
    }, []);

    // 获取不带扩展名的文件名
    const getBaseName = (filename: string): string => {
        return filename.replace(/\.[^/.]+$/, "")
                       .toLowerCase()
                       .replace(/[_\-]/g, " ")
                       .trim();
    };

    // 计算两个字符串的相似度 (0-100)
    const calculateSimilarity = (str1: string, str2: string): number => {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) {
            return 100;
        }
        
        // 如果完全匹配，返回100
        if (longer === shorter) {
            return 100;
        }
        
        // 如果短字符串是长字符串的一部分，给个高分
        if (longer.includes(shorter)) {
            return 90;
        }
        
        // Levenshtein距离计算
        const costs: number[] = [];
        for (let i = 0; i <= shorter.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= longer.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
                        newValue = Math.min(
                            Math.min(newValue, lastValue),
                            costs[j]
                        ) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) {
                costs[longer.length] = lastValue;
            }
        }
        
        const distance = costs[longer.length];
        const percentSimilar = ((longer.length - distance) / longer.length) * 100;
        return Math.round(percentSimilar);
    };

    // 自动匹配文件
    const matchFiles = useCallback(() => {
        if (audioFiles.length === 0 || lrcFiles.length === 0) {
            return;
        }
        
        const newMatches: FileMatch[] = [];
        
        // 为每个音频文件找到最佳匹配的歌词文件
        audioFiles.forEach(audioFile => {
            const audioBaseName = getBaseName(audioFile.name);
            let bestMatch: BestMatch | null = null;
            let highestConfidence = 0;
            let bestLrcFile: File | null = null;
            
            // 找到最佳匹配的歌词文件
            lrcFiles.forEach(lrcFile => {
                const lrcBaseName = getBaseName(lrcFile.name);
                const confidence = calculateSimilarity(audioBaseName, lrcBaseName);
                
                if (confidence > highestConfidence) {
                    highestConfidence = confidence;
                    bestLrcFile = lrcFile;
                }
            });
            
            // 如果找到匹配并且分数高于阈值
            if (bestLrcFile && highestConfidence > 70) {
                newMatches.push({
                    audioFile,
                    lrcFile: bestLrcFile,
                    matchConfidence: highestConfidence,
                    status: "matched"
                });
            } else {
                // 没有找到合适的匹配
                newMatches.push({
                    audioFile,
                    lrcFile: null,
                    matchConfidence: 0,
                    status: "unmatched"
                });
            }
        });
        
        updateMatches(newMatches);
    }, [audioFiles, lrcFiles, getBaseName, calculateSimilarity]);

    // 当文件列表变化时自动匹配
    useEffect(() => {
        if (audioFiles.length > 0 && lrcFiles.length > 0) {
            matchFiles();
        }
    }, [audioFiles, lrcFiles, matchFiles]);

    // 手动更改匹配
    const updateMatch = (index: number, lrcFile: File | null) => {
        const newMatches = [...matches];
        if (index >= 0 && index < newMatches.length) {
            newMatches[index] = {
                ...newMatches[index],
                lrcFile,
                matchConfidence: lrcFile ? 100 : 0,
                status: lrcFile ? "matched" : "unmatched"
            };
        }
        updateMatches(newMatches);
    };

    // 处理匹配的文件
    const processFiles = async () => {
        setProcessing(true);
        updateProcessingIndex(0);
        
        // 复制匹配数组以便更新
        const newMatches = [...matches];
        let lastProcessedMatch: FileMatch | null = null;
        
        for (let i = 0; i < newMatches.length; i++) {
            updateProcessingIndex(i);
            
            const match = newMatches[i];
            // 确保文件存在后再处理
            if (match.status === "matched" && match.audioFile && match.lrcFile) {
                try {
                    // 读取歌词文件内容
                    const lrcText = await match.lrcFile.text();
                    
                    // 验证音频文件
                    if (match.audioFile.type.startsWith("audio/") || 
                        match.audioFile.name.endsWith(".mp3") || 
                        match.audioFile.name.endsWith(".wav") || 
                        match.audioFile.name.endsWith(".flac") ||
                        match.audioFile.name.endsWith(".ogg") || 
                        match.audioFile.name.endsWith(".m4a")) {
                        
                        // 创建Blob URL
                        const audioUrl = URL.createObjectURL(match.audioFile);
                        
                        // 使用Promise包装音频加载过程
                        await new Promise<void>((resolve, reject) => {
                            // 创建音频元素 (临时)
                            const testAudio = new Audio();
                            
                            const onLoaded = () => {
                                console.log(`音频文件 ${match.audioFile?.name} 加载成功`);
                                // 检查音频是否有效（长度大于0）
                                if (testAudio.duration > 0) {
                                    resolve();
                                } else {
                                    reject(new Error("音频文件长度为0"));
                                }
                            };
                            
                            const onError = () => {
                                reject(new Error(`无法加载音频文件: ${testAudio.error?.message || "未知错误"}`));
                            };
                            
                            // 添加事件监听器
                            testAudio.addEventListener('loadedmetadata', onLoaded, { once: true });
                            testAudio.addEventListener('error', onError, { once: true });
                            
                            // 设置超时
                            const timeout = setTimeout(() => {
                                testAudio.removeEventListener('loadedmetadata', onLoaded);
                                testAudio.removeEventListener('error', onError);
                                reject(new Error("音频加载超时"));
                            }, 5000);
                            
                            // 加载音频
                            testAudio.src = audioUrl;
                            testAudio.load();
                            
                            // 清理函数
                            testAudio.onloadedmetadata = () => {
                                clearTimeout(timeout);
                            };
                        });
                        
                        // 释放测试用的blob URL
                        URL.revokeObjectURL(audioUrl);
                        
                        // 保存处理结果
                        newMatches[i].result = lrcText;
                        newMatches[i].status = "processed";
                        
                        // 记录最后一个成功处理的匹配
                        lastProcessedMatch = newMatches[i];
                    } else {
                        // 不支持的音频文件类型
                        throw new Error(`不支持的音频文件类型: ${match.audioFile.type || match.audioFile.name}`);
                    }
                    
                } catch (error) {
                    console.error("处理文件时出错:", error);
                    newMatches[i].error = error instanceof Error ? error.message : "Unknown error";
                    newMatches[i].status = "error";
                }
            }
            
            // 更新状态
            updateMatches([...newMatches]);
        }
        
        // 如果有成功处理的文件，自动加载最后一个
        if (lastProcessedMatch && lastProcessedMatch.audioFile && lastProcessedMatch.result) {
            console.log("加载最后处理的文件:", lastProcessedMatch.audioFile.name);
            loadMatchedFiles(lastProcessedMatch);
        }
        
        setProcessing(false);
        updateProcessingIndex(-1);
    };

    // 导出处理后的歌词文件
    const exportResults = () => {
        matches.forEach(match => {
            if (match.status === "processed" && match.result && match.audioFile) {
                const fileName = getBaseName(match.audioFile.name) + ".lrc";
                const blob = new Blob([match.result], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    };

    // 导出所有处理后的文件为ZIP
    const exportAsZip = () => {
        // 这个功能需要额外的库，如JSZip
        // 简单实现就是循环调用exportResults
        exportResults();
    };

    // Function to preview audio file
    const previewAudio = (file: File) => {
        console.log(`Preview audio file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
        // 使用全局 loadAudio 函数加载音频
        loadAudio(file);
    };

    // 加载音频和歌词到编辑器
    const loadMatchedFiles = (match: FileMatch) => {
        if (!match.audioFile || !match.result) {
            console.error("无法加载文件：音频或歌词不完整");
            return;
        }

        console.log(`加载匹配的文件: ${match.audioFile.name}`);
        
        // 首先加载音频文件
        loadAudio(match.audioFile);
        
        // 然后加载歌词
        loadLyric(match.result);
    };

    return (
        <div className="batch-processor">
            <h2>批量处理歌词</h2>
            
            <div className="file-upload-section">
                <div className="upload-container">
                    <h3>上传音频文件</h3>
                    <div 
                        className="drop-area"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleAudioDrop}
                    >
                        <p>拖放音频文件或文件夹到此处，或</p>
                        <div className="file-input-buttons">
                            <input 
                                type="file"
                                ref={audioInputRef}
                                onChange={handleAudioUpload}
                                multiple
                                accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a"
                                id="audio-input"
                                className="file-input"
                            />
                            <label htmlFor="audio-input" className="file-input-label">选择文件</label>
                            
                            <input 
                                type="file"
                                ref={audioDirInputRef}
                                onChange={handleAudioFolderUpload}
                                webkitdirectory=""
                                directory=""
                                id="audio-dir-input"
                                className="file-input"
                            />
                            <label htmlFor="audio-dir-input" className="file-input-label">选择文件夹</label>
                        </div>
                    </div>
                    {audioFiles.length > 0 && (
                        <div className="file-list">
                            <h4>已选择 {audioFiles.length} 个音频文件</h4>
                            <ul>
                                {audioFiles.map((file, index) => (
                                    <li key={`audio-${index}`}>{file.name}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
                
                <div className="upload-container">
                    <h3>上传歌词文件</h3>
                    <div 
                        className="drop-area"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleLrcDrop}
                    >
                        <p>拖放歌词文件或文件夹到此处，或</p>
                        <div className="file-input-buttons">
                            <input 
                                type="file"
                                ref={lrcInputRef}
                                onChange={handleLrcUpload}
                                multiple
                                accept=".lrc,.txt"
                                id="lrc-input"
                                className="file-input"
                            />
                            <label htmlFor="lrc-input" className="file-input-label">选择文件</label>
                            
                            <input 
                                type="file"
                                ref={lrcDirInputRef}
                                onChange={handleLrcFolderUpload}
                                webkitdirectory=""
                                directory=""
                                id="lrc-dir-input"
                                className="file-input"
                            />
                            <label htmlFor="lrc-dir-input" className="file-input-label">选择文件夹</label>
                        </div>
                    </div>
                    {lrcFiles.length > 0 && (
                        <div className="file-list">
                            <h4>已选择 {lrcFiles.length} 个歌词文件</h4>
                            <ul>
                                {lrcFiles.map((file, index) => (
                                    <li key={`lrc-${index}`}>{file.name}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="action-buttons">
                <button 
                    onClick={clearFiles}
                    className="action-button"
                    disabled={audioFiles.length === 0 && lrcFiles.length === 0}
                >
                    清除文件
                </button>
                <button 
                    onClick={matchFiles}
                    className="action-button primary"
                    disabled={audioFiles.length === 0 || lrcFiles.length === 0}
                >
                    重新匹配
                </button>
            </div>
            
            {matches.length > 0 && (
                <div className="match-results">
                    <h3>匹配结果</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>序号</th>
                                <th>音频文件</th>
                                <th>歌词文件</th>
                                <th>匹配度</th>
                                <th>状态</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matches.map((match, index) => (
                                <tr key={index} className={processingIndex === index ? "processing" : ""}>
                                    <td>{index + 1}</td>
                                    <td>{match.audioFile?.name || "无"}</td>
                                    <td>
                                        {match.lrcFile ? match.lrcFile.name : (
                                            <select 
                                                onChange={(e) => {
                                                    const selectedIndex = parseInt(e.target.value);
                                                    updateMatch(index, selectedIndex >= 0 ? lrcFiles[selectedIndex] : null);
                                                }}
                                                value="-1"
                                            >
                                                <option value="-1">-- 选择歌词文件 --</option>
                                                {lrcFiles.map((file, fileIndex) => (
                                                    <option key={fileIndex} value={fileIndex}>
                                                        {file.name}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td>{match.matchConfidence}%</td>
                                    <td>
                                        {match.status === "matched" && "已匹配"}
                                        {match.status === "unmatched" && "未匹配"}
                                        {match.status === "processed" && "已处理"}
                                        {match.status === "error" && (
                                            <span className="error-text">错误</span>
                                        )}
                                    </td>
                                    <td>
                                        {match.lrcFile && (
                                            <button 
                                                onClick={() => updateMatch(index, null)}
                                                className="small-button"
                                            >
                                                移除匹配
                                            </button>
                                        )}
                                        {match.audioFile && (
                                            <>
                                                <button 
                                                    onClick={() => previewAudio(match.audioFile!)}
                                                    className="small-button preview-button"
                                                    title="预览音频"
                                                >
                                                    预览
                                                </button>
                                                {match.status === "processed" && (
                                                    <button 
                                                        onClick={() => loadMatchedFiles(match)}
                                                        className="small-button play-button"
                                                        title="加载到播放器"
                                                    >
                                                        加载
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    <div className="action-buttons">
                        <button 
                            onClick={processFiles}
                            className="action-button primary"
                            disabled={processing || matches.every(m => m.status !== "matched")}
                        >
                            {processing ? `处理中 (${processingIndex + 1}/${matches.length})` : "处理文件"}
                        </button>
                        <button 
                            onClick={exportResults}
                            className="action-button"
                            disabled={matches.every(m => m.status !== "processed")}
                        >
                            导出结果
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}; 
