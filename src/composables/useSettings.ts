import { ref, type Ref } from 'vue';
import { clampCanvasSize } from '../constants/wc3CanvasLimits';
import type { Settings } from '../types';

function applyCanvasClamp(s: Settings): void {
    const { width, height } = clampCanvasSize(s.canvasWidth, s.canvasHeight);
    s.canvasWidth = width;
    s.canvasHeight = height;
}

export function useSettings() {
    const showSettings = ref(false);
    const settings: Ref<Settings> = ref({
        canvasWidth: 800,
        canvasHeight: 600,
        rulerStep: 50,
        gridSnapStep: 10,
        autoSave: false,
        // 左侧控件面板宽度
        controlPanelWidth: 220,
        // 画布背景颜色与背景图片
        canvasBgColor: '#1a1a1a',
        canvasBgImage: '',
        // 全局资源库（跨项目共享）：空串 = 未配置
        globalResourceRootPath: '',
        defaultConvertToBlp: true,
    });

    const saveSettings = (): boolean => {
        try {
            window.localStorage.setItem('frame_vue_settings', JSON.stringify(settings.value));
            return true;
        } catch (e) {
            console.error('保存设置失败', e);
            return false;
        }
    };

    const resetSettings = () => {
        settings.value = {
            canvasWidth: 800,
            canvasHeight: 600,
            rulerStep: 50,
            gridSnapStep: 10,
            autoSave: false,
            controlPanelWidth: 220,
            canvasBgColor: '#1a1a1a',
            canvasBgImage: '',
            globalResourceRootPath: '',
            defaultConvertToBlp: true,
        };
        applyCanvasClamp(settings.value);
    };

    const loadSettings = () => {
        try {
            const raw = window.localStorage.getItem('frame_vue_settings');
            if (raw) {
                const saved = JSON.parse(raw) as Partial<Settings>;
                if (saved) {
                    settings.value = { ...settings.value, ...saved };
                    applyCanvasClamp(settings.value);
                }
            }
        } catch (e) {
            console.warn('加载设置失败', e);
        }
    };

    return {
        showSettings,
        settings,
        saveSettings,
        resetSettings,
        loadSettings,
    };
}

