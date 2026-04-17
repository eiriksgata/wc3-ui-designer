import { ref } from 'vue';
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases, mdi } from 'vuetify/iconsets/mdi';
import * as directives from 'vuetify/directives';
import * as components from 'vuetify/components';
import '@mdi/font/css/materialdesignicons.css';

export type AppThemeName = 'appDark' | 'appLight';

const STORAGE_KEY = 'frame-ui-designer-theme';

const resolveInitialTheme = (): AppThemeName => {
    if (typeof window === 'undefined') {
        return 'appDark';
    }
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'appLight' ? 'appLight' : 'appDark';
};

export const activeThemeName = ref<AppThemeName>(resolveInitialTheme());

export const vuetify = createVuetify({
    components,
    directives,
    icons: {
        defaultSet: 'mdi',
        aliases,
        sets: { mdi },
    },
    theme: {
        defaultTheme: activeThemeName.value,
        themes: {
            appDark: {
                dark: true,
                colors: {
                    background: '#1b1d21',
                    surface: '#262a31',
                    'surface-variant': '#2f3540',
                    primary: '#3b82f6',
                    secondary: '#8b9bb6',
                    info: '#60a5fa',
                    success: '#43a047',
                    warning: '#fb8c00',
                    error: '#ef5350',
                },
            },
            appLight: {
                dark: false,
                colors: {
                    background: '#f3f5f8',
                    surface: '#ffffff',
                    'surface-variant': '#e7ebf3',
                    primary: '#2563eb',
                    secondary: '#5f6e84',
                    info: '#1976d2',
                    success: '#2e7d32',
                    warning: '#ed6c02',
                    error: '#d32f2f',
                },
            },
        },
    },
});

export const setAppTheme = (name: AppThemeName) => {
    activeThemeName.value = name;
    vuetify.theme.global.name.value = name;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, name);
    }
};

export const toggleAppTheme = () => {
    setAppTheme(activeThemeName.value === 'appDark' ? 'appLight' : 'appDark');
};
