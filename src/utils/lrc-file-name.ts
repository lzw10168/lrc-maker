const filenamify = (name: string): string => {
    return name.replace(/[<>:"/\\|?*]/g, "_").trim();
};

// Add a global variable to store the current audio filename
let currentAudioFileName: string | null = null;

// Function to set the current audio filename
export const setCurrentAudioFileName = (fileName: string): void => {
    // Remove file extension
    currentAudioFileName = fileName.replace(/\.[^/.]+$/, "");
};

export const lrcFileName = (lrcInfo: Map<string, string>): string => {
    // If we have an audio filename, use it for the LRC filename
    if (currentAudioFileName) {
        return `${filenamify(currentAudioFileName)}.lrc`;
    }
    
    // Fall back to the original behavior if no audio filename is available
    const list = [lrcInfo.get("ti"), lrcInfo.get("ar")].filter((v) => !!v);

    if (list.length === 0) {
        if (lrcInfo.has("al")) {
            list.push(lrcInfo.get("al"));
        }
        list.push(new Date().toLocaleString());
    }
    return (list as string[]).map((name) => filenamify(name)).join(" - ") + ".lrc";
};
