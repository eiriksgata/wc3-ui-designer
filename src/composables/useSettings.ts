import { ref, type Ref } from 'vue';
import type { Settings } from '../types';

export function useSettings() {
    const showSettings = ref(false);
    const settings: Ref<Settings> = ref({
        canvasWidth: 1920,
        canvasHeight: 1080,
        rulerStep: 50,
        gridSnapStep: 10,
        autoSave: false,
        // 左侧控件面板宽度
        controlPanelWidth: 220,
        // 画布背景颜色与背景图片
        canvasBgColor: '#1a1a1a',
        canvasBgImage: '',
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
            canvasWidth: 1920,
            canvasHeight: 1080,
            rulerStep: 50,
            gridSnapStep: 10,
            autoSave: false,
            controlPanelWidth: 220,
            canvasBgColor: '#1a1a1a',
            canvasBgImage: '',
        };
    };

    const loadSettings = () => {
        try {
            const raw = window.localStorage.getItem('frame_vue_settings');
            if (raw) {
                const saved = JSON.parse(raw) as Partial<Settings>;
                if (saved) {
                    settings.value = { ...settings.value, ...saved };
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

