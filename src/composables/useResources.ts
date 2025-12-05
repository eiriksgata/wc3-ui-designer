import { ref, type Ref } from 'vue';
import { decodeTgaToDataUrl } from '../utils/tgaDecoder';
import type { ImageResource } from '../types';

export function useResources() {
    const resourceInputRef = ref<HTMLInputElement | null>(null);
    // 默认不再内置任何图片资源，完全由用户导入
    const imageResources: Ref<ImageResource[]> = ref([]);

    const triggerImportResources = () => {
        resourceInputRef.value?.click();
    };

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    };

    const handleResourcesSelected = async (ev: Event): Promise<number> => {
        const target = ev.target as HTMLInputElement;
        const files = Array.from(target.files || []);
        if (!files.length) return 0;

        const newResources: ImageResource[] = [];
        for (const file of files) {
            const rel = (file as any).webkitRelativePath || file.name;
            const war3Path = rel.replace(/\//g, '\\');
            const localPath = (file as any).path || '';
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            let previewUrl = '';
            try {
                if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
                    // 统一转换为 dataURL，便于保存到项目文件中，下次打开仍可直接显示缩略图
                    previewUrl = await fileToDataUrl(file);
                } else if (ext === 'tga') {
                    previewUrl = await decodeTgaToDataUrl(file);
                } else if (ext === 'blp') {
                    // 浏览器无法直接解码 BLP，只保留路径用于导出
                    previewUrl = '';
                }
            } catch (e) {
                console.error('解码资源失败:', file.name, e);
            }

            newResources.push({
                label: file.name,
                value: war3Path,
                previewUrl,
                localPath,
            });
        }

        // 去重：使用 Map 确保相同路径的资源只保留一个
        const map = new Map<string, ImageResource>();
        imageResources.value.forEach((r) => map.set(r.value, r));
        newResources.forEach((r) => {
            if (!map.has(r.value)) map.set(r.value, r);
        });
        imageResources.value = Array.from(map.values());

        if (resourceInputRef.value) {
            resourceInputRef.value.value = '';
        }

        return newResources.length;
    };

    return {
        resourceInputRef,
        imageResources,
        triggerImportResources,
        handleResourcesSelected,
    };
}

