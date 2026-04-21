import { ref, type Ref } from 'vue';
import type { ImageResource } from '../types';

/**
 * useResources 仅负责持有项目资源列表的 ref。
 *
 * Schema 2.0.0 起，所有"添加资源"的入口都必须经过全局库流水线（见
 * `useGlobalResourceLibrary.importAndRefInProject` / App.vue 的路由）。
 * 因此这里不再暴露任何直接往 `imageResources` 写入的接口——
 * 旧的 `handleResourcesSelected` 会产生没有 `globalRelPath` 的野条目，
 * 已移除。
 */
export function useResources() {
    const resourceInputRef = ref<HTMLInputElement | null>(null);
    const imageResources: Ref<ImageResource[]> = ref([]);

    return {
        resourceInputRef,
        imageResources,
    };
}
