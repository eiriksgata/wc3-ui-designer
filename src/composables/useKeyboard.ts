import { onMounted, onBeforeUnmount, type Ref } from 'vue';

export function useKeyboard(
    copySelection: () => void,
    pasteClipboardWithHistory: () => void,
    undoLayout: () => void,
    redoLayout: () => void,
    saveProjectToFile: () => Promise<boolean>,
    saveProjectAsFile: () => Promise<void>,
    handleNewProject: () => void,
    loadProjectFromFile: () => void,
    closeProject: () => void,
    uiZoom: Ref<number>,
    applyUiZoom: () => void,
    deleteSelectedWithHistory: () => void,
    selectedIds: Ref<number[]>,
    isSpacePressed: Ref<boolean>,
    isPanning: Ref<boolean>,
    gridMode: Ref<number>,
    doExport: () => Promise<void>, // F9 导出
) {
    const handleKeyDown = (ev: KeyboardEvent) => {
        const tag = ev.target && (ev.target as HTMLElement).tagName;
        const isFormElement =
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            (ev.target && (ev.target as HTMLElement).isContentEditable);

        // 在输入框里允许默认的复制粘贴等，不拦截
        if (isFormElement) {
            // 空格键在输入框内保持默认行为
        } else {
            // 常用快捷键：复制/粘贴/撤销/重做/删除
            if (ev.ctrlKey || ev.metaKey) {
                const isShift = ev.shiftKey;
                switch (ev.code) {
                    case 'KeyC':
                        copySelection();
                        ev.preventDefault();
                        break;
                    case 'KeyV':
                        pasteClipboardWithHistory();
                        ev.preventDefault();
                        break;
                    case 'KeyZ':
                        undoLayout();
                        ev.preventDefault();
                        break;
                    case 'KeyY':
                        redoLayout();
                        ev.preventDefault();
                        break;
                    case 'KeyS':
                        if (isShift) {
                            // Ctrl+Shift+S：另存为
                            saveProjectAsFile();
                        } else {
                            // Ctrl+S：保存项目（在 Tauri 中会保存回原文件，在浏览器中触发下载）
                            saveProjectToFile();
                        }
                        ev.preventDefault();
                        break;
                    case 'KeyN':
                        // Ctrl+N：新建项目
                        handleNewProject();
                        ev.preventDefault();
                        break;
                    case 'KeyO':
                        // Ctrl+O：打开项目
                        loadProjectFromFile();
                        ev.preventDefault();
                        break;
                    case 'KeyW':
                        // Ctrl+W：关闭当前项目并返回欢迎界面
                        closeProject();
                        ev.preventDefault();
                        break;
                    case 'Equal':       // Ctrl + '='（通常是 Ctrl + '+'）
                    case 'NumpadAdd':   // 小键盘 +
                        uiZoom.value = (uiZoom.value || 1) + 0.1;
                        applyUiZoom();
                        ev.preventDefault();
                        break;
                    case 'Minus':       // Ctrl + '-'
                    case 'NumpadSubtract':
                        uiZoom.value = (uiZoom.value || 1) - 0.1;
                        applyUiZoom();
                        ev.preventDefault();
                        break;
                }
            } else if (ev.code === 'Delete' || ev.code === 'Backspace') {
                // selectedIds 需要从外部传入
                if (selectedIds && selectedIds.value && selectedIds.value.length) {
                    deleteSelectedWithHistory();
                    ev.preventDefault();
                }
            } else if (!isFormElement && ev.code === 'F4') {
                // F4：执行导出
                if (typeof doExport === 'function') {
                    doExport();
                    ev.preventDefault();
                }
            } else if (ev.code === 'Space') {
                // 空格键：开始平移画布
                if (!isPanning.value) {
                    isSpacePressed.value = true;
                }
                ev.preventDefault();
            } else if (ev.code === 'KeyG') {
                // G 键：切换网格显示（128×128 → 64×64 → 关闭）
                gridMode.value = (gridMode.value + 1) % 4;
                ev.preventDefault();
            }
        }
    };

    const handleKeyUp = (ev: KeyboardEvent) => {
        if (ev.code === 'Space') {
            isSpacePressed.value = false;
        }
    };

    const setupKeyboardListeners = () => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
    };

    const removeKeyboardListeners = () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };

    onMounted(() => {
        setupKeyboardListeners();
    });

    onBeforeUnmount(() => {
        removeKeyboardListeners();
    });

    return {
        setupKeyboardListeners,
        removeKeyboardListeners,
    };
}

