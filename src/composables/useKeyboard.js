import { onMounted, onBeforeUnmount } from 'vue';

export function useKeyboard(
    copySelection,
    pasteClipboardWithHistory,
    undoLayout,
    redoLayout,
    saveProjectToFile,
    saveProjectAsFile,
    handleNewProject,
    loadProjectFromFile,
    closeProject,
    uiZoom,
    applyUiZoom,
    deleteSelectedWithHistory,
    selectedIds,
    isSpacePressed,
    isPanning,
    gridMode,
    doExport, // F9 导出
) {
    const handleKeyDown = (ev) => {
        const tag = ev.target && ev.target.tagName;
        const isFormElement =
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            (ev.target && ev.target.isContentEditable);

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
                    ev.stopPropagation();
                }
            }
        }
        if (!isFormElement && ev.code === 'Space' && !isSpacePressed.value) {
            isSpacePressed.value = true;
            ev.preventDefault();
        }
        if (ev.code === 'KeyG' || ev.key === 'g' || ev.key === 'G') {
            if (!ev.repeat) {
                // G 键轮换网格显示模式：0=关闭，1=128*128，2=64*64，3=32*32
                gridMode.value = (gridMode.value + 1) % 4;
                ev.preventDefault();
                ev.stopPropagation();
            }
        }
    };

    const handleKeyUp = (ev) => {
        if (ev.code === 'Space') {
            isSpacePressed.value = false;
            isPanning.value = false;
        }
    };

    const setupKeyboardListeners = () => {
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keyup', handleKeyUp, true);
    };

    const removeKeyboardListeners = () => {
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keyup', handleKeyUp, true);
    };

    return {
        handleKeyDown,
        handleKeyUp,
        setupKeyboardListeners,
        removeKeyboardListeners,
    };
}

