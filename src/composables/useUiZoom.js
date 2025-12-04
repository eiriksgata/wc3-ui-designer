import { ref } from 'vue';

export function useUiZoom() {
    const uiZoom = ref(1);
    const UI_ZOOM_STORAGE_KEY = 'frame_ui_zoom';

    const applyUiZoom = () => {
        if (typeof document === 'undefined') return;
        const clamped = Math.max(0.5, Math.min(2, uiZoom.value || 1));
        uiZoom.value = clamped;
        document.documentElement.style.setProperty('--ui-zoom', clamped.toFixed(2));
        try {
            window.localStorage.setItem(UI_ZOOM_STORAGE_KEY, String(clamped));
        } catch (e) {
            console.warn('保存 UI 缩放失败', e);
        }
    };

    const loadUiZoom = () => {
        try {
            const raw = window.localStorage.getItem(UI_ZOOM_STORAGE_KEY);
            if (!raw) return;
            const v = parseFloat(raw);
            if (!isNaN(v) && v > 0) {
                uiZoom.value = v;
                applyUiZoom();
            }
        } catch (e) {
            console.warn('加载界面缩放失败', e);
        }
    };

    return {
        uiZoom,
        applyUiZoom,
        loadUiZoom,
    };
}

