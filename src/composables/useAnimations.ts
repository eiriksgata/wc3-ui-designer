import { ref, computed, type Ref } from 'vue';
import type { Widget, Animation } from '../types';

/**
 * 动画系统（仅编辑器）
 * - 负责为控件记录动画数据：类型 / 时长 / 延迟 / 是否循环等
 * - 不直接操作 DOM，预览和导出由上层决定如何使用这些数据
 */
// 对应 lapi.TWEEN_TYPE 的缓动函数集合（t ∈ [0,1]）
const Easing = {
    // 0 线性
    linear(t: number): number {
        return t;
    },
    // 1 / 2 / 3 正弦 出 / 入 / 出入
    sineIn(t: number): number {
        return 1 - Math.cos((t * Math.PI) / 2);
    },
    sineOut(t: number): number {
        return Math.sin((t * Math.PI) / 2);
    },
    sineInOut(t: number): number {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    },
    // 4 / 5 / 6 Quad 二次方
    quadIn(t: number): number {
        return t * t;
    },
    quadOut(t: number): number {
        return 1 - (1 - t) * (1 - t);
    },
    quadInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },
    // 7 / 8 / 9 Cubic 三次方
    cubicIn(t: number): number {
        return t * t * t;
    },
    cubicOut(t: number): number {
        return 1 - Math.pow(1 - t, 3);
    },
    cubicInOut(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    // 10 / 11 / 12 Quart 四次方
    quartIn(t: number): number {
        return t * t * t * t;
    },
    quartOut(t: number): number {
        return 1 - Math.pow(1 - t, 4);
    },
    quartInOut(t: number): number {
        return t < 0.5
            ? 8 * Math.pow(t, 4)
            : 1 - Math.pow(-2 * t + 2, 4) / 2;
    },
    // 13 / 14 / 15 Quint 五次方
    quintIn(t: number): number {
        return t * t * t * t * t;
    },
    quintOut(t: number): number {
        return 1 - Math.pow(1 - t, 5);
    },
    quintInOut(t: number): number {
        return t < 0.5
            ? 16 * Math.pow(t, 5)
            : 1 - Math.pow(-2 * t + 2, 5) / 2;
    },
    // 16 / 17 / 18 Expo 指数
    expoIn(t: number): number {
        return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
    },
    expoOut(t: number): number {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    },
    expoInOut(t: number): number {
        if (t === 0 || t === 1) return t;
        if (t < 0.5) return Math.pow(2, 20 * t - 11);
        return 1 - Math.pow(2, -20 * t + 11);
    },
    // 19 / 20 / 21 Circ 圆形
    circIn(t: number): number {
        return 1 - Math.sqrt(1 - t * t);
    },
    circOut(t: number): number {
        return Math.sqrt(1 - (t - 1) * (t - 1));
    },
    circInOut(t: number): number {
        if (t < 0.5) {
            return (1 - Math.sqrt(1 - 4 * t * t)) / 2;
        }
        return (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    },
    // 22 / 23 / 24 Elastic 弹性
    elasticIn(t: number): number {
        if (t === 0 || t === 1) return t;
        const c4 = (2 * Math.PI) / 3;
        return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    elasticOut(t: number): number {
        if (t === 0 || t === 1) return t;
        const c4 = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    elasticInOut(t: number): number {
        if (t === 0 || t === 1) return t;
        const c5 = (2 * Math.PI) / 4.5;
        if (t < 0.5) {
            return (
                -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
            );
        }
        return (
            Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5) / 2 + 1
        );
    },
    // 25 / 26 / 27 Back 后退
    backIn(t: number): number {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return c3 * t * t * t - c1 * t * t;
    },
    backOut(t: number): number {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    backInOut(t: number): number {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        if (t < 0.5) {
            return (
                (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            );
        }
        return (
            (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
        );
    },
    // 28 / 29 / 30 Bounce 弹跳
    bounceOut(t: number): number {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
            return n1 * t * t;
        } else if (t < 2 / d1) {
            t -= 1.5 / d1;
            return n1 * t * t + 0.75;
        } else if (t < 2.5 / d1) {
            t -= 2.25 / d1;
            return n1 * t * t + 0.9375;
        } else {
            t -= 2.625 / d1;
            return n1 * t * t + 0.984375;
        }
    },
    bounceIn(t: number): number {
        return 1 - Easing.bounceOut(1 - t);
    },
    bounceInOut(t: number): number {
        if (t < 0.5) {
            return (1 - Easing.bounceOut(1 - 2 * t)) / 2;
        }
        return (1 + Easing.bounceOut(2 * t - 1)) / 2;
    },
};

// 根据 tweenType（lapi.TWEEN_TYPE）返回对应缓动值
function easeByTweenType(t: number, tweenType: number): number {
    switch (tweenType) {
        case 0: return Easing.linear(t);
        case 1: return Easing.sineOut(t);
        case 2: return Easing.sineIn(t);
        case 3: return Easing.sineInOut(t);
        case 4: return Easing.quadIn(t);
        case 5: return Easing.quadOut(t);
        case 6: return Easing.quadInOut(t);
        case 7: return Easing.cubicIn(t);
        case 8: return Easing.cubicOut(t);
        case 9: return Easing.cubicInOut(t);
        case 10: return Easing.quartIn(t);
        case 11: return Easing.quartOut(t);
        case 12: return Easing.quartInOut(t);
        case 13: return Easing.quintIn(t);
        case 14: return Easing.quintOut(t);
        case 15: return Easing.quintInOut(t);
        case 16: return Easing.expoIn(t);
        case 17: return Easing.expoOut(t);
        case 18: return Easing.expoInOut(t);
        case 19: return Easing.circIn(t);
        case 20: return Easing.circOut(t);
        case 21: return Easing.circInOut(t);
        case 22: return Easing.elasticIn(t);
        case 23: return Easing.elasticOut(t);
        case 24: return Easing.elasticInOut(t);
        case 25: return Easing.backIn(t);
        case 26: return Easing.backOut(t);
        case 27: return Easing.backInOut(t);
        case 28: return Easing.bounceIn(t);
        case 29: return Easing.bounceOut(t);
        case 30: return Easing.bounceInOut(t);
        default: return t;
    }
}

// 预览时假定的帧率（仅用于从帧数换算到毫秒，不影响导出数据）
const PREVIEW_FPS = 60;

interface WidgetWithPreview extends Widget {
    _previewAlpha?: number;
}

export function useAnimations(widgetsList: Ref<Widget[]>, selectedIds: Ref<number[]>) {
    const animations = ref<Animation[]>([]);
    const nextAnimId = ref(1);
    // 当前正在播放的预览（用于防止多次点击导致状态错乱）
    let currentPreviewStop: (() => void) | null = null;

    const currentWidgetId = computed(() => selectedIds.value[0] ?? null);

    const currentWidgetAnimations = computed(() => {
        const id = currentWidgetId.value;
        if (!id) return [];
        return animations.value.filter((a) => a.widgetId === id);
    });

    const addAnimationForSelected = (type: string = 'move') => {
        const widgetId = currentWidgetId.value;
        if (!widgetId) return;

        const id = nextAnimId.value++;
        let params: any = {};
        if (type === 'move') {
            // 目标位置（可选），不填则使用当前位置附近做预览 + 缓动类型
            params = { toX: null, toY: null, tweenType: 0 };
        } else {
            // 其他类型目前只用到缓动枚举
            params = { tweenType: 0 };
        }

        animations.value.push({
            id,
            widgetId,
            name: `动画_${id}`,
            type, // 'move' | 'scale' | 'alpha' 等
            duration: 1.0,
            delay: 0,
            loop: false,
            params,
        });
    };

    const removeAnimation = (id: number) => {
        animations.value = animations.value.filter((a) => a.id !== id);
    };

    const duplicateAnimation = (id: number) => {
        const src = animations.value.find((a) => a.id === id);
        if (!src) return;
        const newId = nextAnimId.value++;
        animations.value.push({
            ...structuredClone(src),
            id: newId,
            name: `${src.name}_复制`,
        });
    };

    const updateAnimation = (id: number, patch: Partial<Animation>) => {
        const idx = animations.value.findIndex((a) => a.id === id);
        if (idx === -1) return;
        animations.value[idx] = {
            ...animations.value[idx],
            ...patch,
        };
    };

    // 预览：在编辑器中临时修改控件属性，播放一遍动画后恢复
    const previewAnimation = (id: number): (() => void) | undefined => {
        // 如果上一次预览还在播放，先强制停止并恢复状态
        if (typeof currentPreviewStop === 'function') {
            currentPreviewStop();
            currentPreviewStop = null;
        }
        const anim = animations.value.find((a) => a.id === id);
        if (!anim) return;

        const rootWidget = widgetsList.value.find((w) => w.id === anim.widgetId) as WidgetWithPreview | undefined;
        if (!rootWidget) return;

        // duration / delay 单位为"帧"，这里按预览帧率换算为毫秒
        const durationFrames = Math.max(1, anim.duration || 1);
        const delayFrames = Math.max(0, anim.delay || 0);
        const frameMs = 1000 / PREVIEW_FPS;
        const durationMs = durationFrames * frameMs;
        const delayMs = delayFrames * frameMs;

        // 收集根控件及所有子控件，确保子控件跟随移动
        const affected: WidgetWithPreview[] = [];
        const collect = (wid: number) => {
            const w = widgetsList.value.find((x) => x.id === wid) as WidgetWithPreview | undefined;
            if (!w) return;
            affected.push(w);
            widgetsList.value.forEach((child) => {
                if (child.parentId === wid) {
                    collect(child.id);
                }
            });
        };
        collect(rootWidget.id);

        const originalState = new Map<number, { x: number; y: number; w: number; h: number; alpha: number }>();
        affected.forEach((w) => {
            originalState.set(w.id, {
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
                alpha: (w as any)._previewAlpha ?? 1,
            });
        });

        const rootOrigin = originalState.get(rootWidget.id);
        if (!rootOrigin) return;
        const startX = rootOrigin.x;
        const startY = rootOrigin.y;
        const startW = rootOrigin.w;
        const startH = rootOrigin.h;
        const startAlpha = rootOrigin.alpha;

        const type = anim.type || 'move';
        const distance = 40; // 默认预览位移/缩放幅度
        const params = anim.params || {};
        const tweenType = typeof params.tweenType === 'number' ? params.tweenType : 0; // 对应 lapi.TWEEN_TYPE

        let stopped = false;
        const startTime = performance.now() + delayMs;

        const step = (now: number) => {
            if (stopped) return;
            if (now < startTime) {
                requestAnimationFrame(step);
                return;
            }
            const t = Math.min(1, (now - startTime) / durationMs);
            const ease = easeByTweenType(t, tweenType);

            if (type === 'move') {
                const targetX =
                    typeof params.toX === 'number' && !isNaN(params.toX)
                        ? params.toX
                        : startX + distance;
                const targetY =
                    typeof params.toY === 'number' && !isNaN(params.toY)
                        ? params.toY
                        : startY;
                const dx = targetX - startX;
                const dy = targetY - startY;

                // 根节点 + 所有子节点一起移动（保持相对布局）
                affected.forEach((w) => {
                    const o = originalState.get(w.id);
                    if (!o) return;
                    w.x = o.x + dx * ease;
                    w.y = o.y + dy * ease;
                });
            } else if (type === 'scale') {
                // 缩放只针对根控件，子控件保持布局
                rootWidget.w = startW + distance * ease;
                rootWidget.h = startH + distance * ease;
            } else if (type === 'alpha') {
                rootWidget._previewAlpha = startAlpha * (1 - 0.5 * ease);
            }

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                // 结束时还原所有受影响控件
                affected.forEach((w) => {
                    const o = originalState.get(w.id);
                    if (!o) return;
                    w.x = o.x;
                    w.y = o.y;
                    w.w = o.w;
                    w.h = o.h;
                    (w as any)._previewAlpha = o.alpha;
                });
            }
        };

        requestAnimationFrame(step);

        // 返回一个停止函数
        const stopFn = () => {
            stopped = true;
            affected.forEach((w) => {
                const o = originalState.get(w.id);
                if (!o) return;
                w.x = o.x;
                w.y = o.y;
                w.w = o.w;
                w.h = o.h;
                (w as any)._previewAlpha = o.alpha;
            });
        };

        // 记录当前预览的停止函数，确保下次点击时能还原状态
        currentPreviewStop = stopFn;
        return stopFn;
    };

    // 导出时使用：返回与 widget 绑定的动画列表
    const getAnimationsForExport = (): Record<string, Omit<Animation, 'id'>[]> => {
        const byWidget: Record<string, Omit<Animation, 'id'>[]> = {};
        for (const anim of animations.value) {
            if (!byWidget[anim.widgetId]) byWidget[anim.widgetId] = [];
            // 导出时不需要编辑器内部的 id
            const { id, ...rest } = anim;
            byWidget[anim.widgetId].push(rest);
        }
        return byWidget;
    };

    return {
        animations,
        nextAnimId,
        currentWidgetAnimations,
        addAnimationForSelected,
        removeAnimation,
        duplicateAnimation,
        updateAnimation,
        getAnimationsForExport,
        previewAnimation,
    };
}

