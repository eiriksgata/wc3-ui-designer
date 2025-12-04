import { ref } from 'vue';

export function useRecentProjects() {
    const recentProjects = ref([]); // { path, name }[]
    const MAX_RECENT_PROJECTS = 5;
    const RECENT_STORAGE_KEY = 'frame_ui_recent_projects';

    const loadRecentProjects = () => {
        try {
            const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                recentProjects.value = arr;
            }
        } catch (e) {
            console.warn('加载最近项目列表失败', e);
        }
    };

    const saveRecentProjects = () => {
        try {
            window.localStorage.setItem(
                RECENT_STORAGE_KEY,
                JSON.stringify(recentProjects.value),
            );
        } catch (e) {
            console.warn('保存最近项目列表失败', e);
        }
    };

    const addRecentProject = (filePath) => {
        if (!filePath) return;
        const name = filePath.split(/[/\\]/).pop() || filePath;
        // 去重：先删掉已有同路径，再插入到最前
        recentProjects.value = [
            { path: filePath, name },
            ...recentProjects.value.filter((p) => p.path !== filePath),
        ].slice(0, MAX_RECENT_PROJECTS);
        saveRecentProjects();
    };

    return {
        recentProjects,
        loadRecentProjects,
        saveRecentProjects,
        addRecentProject,
    };
}

