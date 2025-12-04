<template>
    <div class="right panel" :style="{ width: rightWidth + 'px' }">
        <h3>属性面板</h3>
        <!-- 单选：显示完整属性 -->
        <div v-if="selectedWidget && selectedIds.length === 1">
            <div class="prop-tabs">
                <button v-for="tab in propertyTabs" :key="tab.id"
                    :class="['prop-tab', { active: activePropertyTab === tab.id }]"
                    @click="$emit('update:activePropertyTab', tab.id)">
                    {{ tab.label }}
                </button>
            </div>

            <!-- 属性页 -->
            <div v-if="activePropertyTab === 'props'">
                <h4 class="prop-section-title">基础信息</h4>
                <label for="widget-name">名字（导出到 Lua 使用）</label>
                <input id="widget-name" name="widget-name" type="text" v-model="selectedWidget.name"
                    title="控件的名称，用于导出到 Lua" />

                <label for="widget-type">类型</label>
                <select id="widget-type" name="widget-type" v-model="selectedWidget.type" title="控件类型">
                    <option v-for="t in allWidgetTypes" :key="t.id" :value="t.id">
                        {{ t.label }} ({{ t.id }})
                    </option>
                </select>

                <!-- 文本内容 & 文本属性：仅文本基础类型控件显示（Panel / Button 不需要 text） -->
                <template v-if="baseTypeOf(selectedWidget.type) === 'text'">
                    <label for="widget-text">文本</label>
                    <textarea id="widget-text" name="widget-text" v-model="selectedWidget.text"
                        title="控件显示的文本内容" placeholder="输入文本内容"></textarea>

                    <!-- 文本额外属性 -->
                    <h4 class="prop-section-title">文本属性</h4>
                    <div class="prop-group prop-grid-2">
                        <label for="widget-font">字体</label>
                        <input id="widget-font" type="text" v-model="selectedWidget.font"
                            placeholder="例如 DENG.ttf 或字体名" />

                        <label for="widget-font-size">字体大小</label>
                        <input id="widget-font-size" type="number" v-model.number="selectedWidget.fontSize" min="1" />

                        <label for="widget-outline-size">描边大小</label>
                        <input id="widget-outline-size" type="number" v-model.number="selectedWidget.outlineSize"
                            min="0" />

                        <label for="widget-text-align">对齐方式</label>
                        <select id="widget-text-align" v-model="selectedWidget.textAlign">
                            <option value="top_left">左上</option>
                            <option value="top">顶部</option>
                            <option value="top_right">右上</option>
                            <option value="left">左侧</option>
                            <option value="center">中心</option>
                            <option value="right">右侧</option>
                            <option value="bottom_left">左下</option>
                            <option value="bottom">底部</option>
                            <option value="bottom_right">右下</option>
                        </select>
                    </div>
                </template>

                <!-- 通用基础属性 -->
                <h4 class="prop-section-title">通用属性</h4>
                <div class="prop-group prop-inline">
                    <label>
                        <input type="checkbox" v-model="selectedWidget.enable" />
                        可交互
                    </label>
                    <label>
                        <input type="checkbox" v-model="selectedWidget.visible" />
                        可见
                    </label>
                    <label>
                        <input type="checkbox" v-model="selectedWidget.locked" />
                        锁定
                    </label>
                </div>

                <!-- 图片 / 按钮属性 -->
                <template v-if="supportsImage(selectedWidget.type)">
                    <h4 class="prop-section-title">图片</h4>
                    <label for="widget-image-select">图片资源（Frame.image）</label>
                    <select id="widget-image-select" name="widget-image-select" v-model="selectedWidget.image"
                        title="选择图片资源">
                        <option value="">无</option>
                        <option v-for="res in imageResources" :key="res.value" :value="res.value">
                            {{ res.label }}（{{ res.value }}）
                        </option>
                    </select>
                    <label for="widget-image-custom">自定义路径（可直接编辑）</label>
                    <input id="widget-image-custom" name="widget-image-custom" type="text"
                        v-model="selectedWidget.image" title="自定义图片路径" placeholder="输入图片路径" />
                </template>

                <!-- Button 额外属性 -->
                <template v-if="baseTypeOf(selectedWidget.type) === 'button'">
                    <h4 class="prop-subtitle">按钮图片</h4>
                    <label for="widget-btn-image-click">点击图片</label>
                    <input id="widget-btn-image-click" type="text" v-model="selectedWidget.clickImage"
                        placeholder="点击状态图片路径" />

                    <label for="widget-btn-image-hover">悬浮图片</label>
                    <input id="widget-btn-image-hover" type="text" v-model="selectedWidget.hoverImage"
                        placeholder="鼠标悬浮图片路径" />

                    <div class="prop-group">
                        <label>
                            <input type="checkbox" v-model="selectedWidget.draggable" />
                            是否可以拖动
                        </label>
                    </div>
                </template>

                <h4 class="prop-section-title">布局</h4>
                <div class="prop-group prop-grid-2">
                    <label for="widget-x">位置 X</label>
                    <input id="widget-x" name="widget-x" type="number" v-model.number="selectedWidget.x"
                        title="控件在画布上的 X 坐标" />

                    <label for="widget-y">位置 Y</label>
                    <input id="widget-y" name="widget-y" type="number" v-model.number="selectedWidget.y"
                        title="控件在画布上的 Y 坐标" />

                    <label for="widget-w">宽度</label>
                    <input id="widget-w" name="widget-w" type="number" v-model.number="selectedWidget.w"
                        title="控件的宽度" />

                    <label for="widget-h">高度</label>
                    <input id="widget-h" name="widget-h" type="number" v-model.number="selectedWidget.h"
                        title="控件的高度" />
                </div>

                <!-- 父节点 -->
                <label>父节点（层级）</label>
                <div class="parent-display">
                    {{
                        parentCandidates.find((w) => w.id === selectedWidget.parentId)?.name ||
                        '无（根节点）'
                    }}
                </div>

                <template v-if="selectedWidget.type === 'checkbox'">
                    <label for="widget-checked">默认选中</label>
                    <input id="widget-checked" name="widget-checked" type="checkbox" v-model="selectedWidget.checked"
                        title="复选框的默认选中状态" />
                </template>

                <template v-if="selectedWidget.type === 'combobox'">
                    <label for="widget-selected-index">当前选项索引（0/1/2...）</label>
                    <input id="widget-selected-index" name="widget-selected-index" type="number"
                        v-model.number="selectedWidget.selectedIndex" title="下拉框当前选中的选项索引" />
                </template>
            </div>

            <!-- 动画页 -->
            <div v-else-if="activePropertyTab === 'anim'">
                <h4 class="prop-section-title">动画（编辑器）</h4>
                <div class="animations-list">
                    <div v-if="currentWidgetAnimations.length === 0" class="hint-text">
                        当前控件暂无动画，点击下方“添加动画”开始。
                    </div>
                    <div v-for="anim in currentWidgetAnimations" :key="anim.id" class="animation-card">
                        <div class="animation-card-header" @click="$emit('toggleAnimationCard', anim.id)">
                            <span class="animation-title">{{ anim.name || '未命名动画' }}</span>
                            <span class="animation-summary">
                                {{ anim.type }} · {{ anim.duration }}f
                                <span v-if="anim.delay"> / 延迟 {{ anim.delay }}f</span>
                                <span v-if="anim.loop"> · 循环</span>
                            </span>
                            <span class="animation-arrow">
                                {{ expandedAnimationId === anim.id ? '▾' : '▸' }}
                            </span>
                        </div>
                        <div v-if="expandedAnimationId === anim.id" class="animation-card-body">
                            <h5 class="prop-subtitle">基础设置</h5>
                            <div class="prop-group prop-grid-2">
                                <label>名称</label>
                                <input class="animation-name" type="text" v-model="anim.name" placeholder="动画名称" />

                                <label>类型</label>
                                <select v-model="anim.type" class="animation-type">
                                    <option value="move">位移动画</option>
                                    <option value="scale">缩放动画</option>
                                    <option value="alpha">透明度动画</option>
                                </select>
                            </div>

                            <h5 class="prop-subtitle">播放参数（单位：帧）</h5>
                            <div class="prop-group prop-grid-2">
                                <label>时长 (帧)</label>
                                <input type="number" min="1" step="1" v-model.number="anim.duration"
                                    class="animation-number" title="持续时间（帧数）" />

                                <label>延迟 (帧)</label>
                                <input type="number" min="0" step="1" v-model.number="anim.delay"
                                    class="animation-number" title="延迟时间（帧数）" />
                            </div>

                            <!-- 仅位移动画时显示目标位置 -->
                            <div v-if="anim.type === 'move'" class="prop-group prop-grid-2">
                                <label>目标 X</label>
                                <input type="number" v-model.number="anim.params.toX" placeholder="留空=使用当前位置" />
                                <label>目标 Y</label>
                                <input type="number" v-model.number="anim.params.toY" placeholder="留空=使用当前位置" />
                            </div>

                            <!-- 缓动类型 -->
                            <h5 class="prop-subtitle">缓动类型</h5>
                            <div class="prop-group">
                                <select v-model.number="anim.params.tweenType">
                                    <option :value="0">线性</option>
                                    <option :value="1">正弦出</option>
                                    <option :value="2">正弦入</option>
                                    <option :value="3">正弦出入</option>
                                    <option :value="4">二元入</option>
                                    <option :value="5">二元出</option>
                                    <option :value="6">二元入出</option>
                                    <option :value="7">三元入</option>
                                    <option :value="8">三元出</option>
                                    <option :value="9">三元入出</option>
                                    <option :value="10">四元入</option>
                                    <option :value="11">四元出</option>
                                    <option :value="12">四元出入</option>
                                    <option :value="13">五元入</option>
                                    <option :value="14">五元出</option>
                                    <option :value="15">五元入出</option>
                                    <option :value="16">指数入</option>
                                    <option :value="17">指数出</option>
                                    <option :value="18">指数入出</option>
                                    <option :value="19">圆形入</option>
                                    <option :value="20">圆形出</option>
                                    <option :value="21">圆形入出</option>
                                    <option :value="22">弹性入</option>
                                    <option :value="23">弹性出</option>
                                    <option :value="24">弹性入出</option>
                                    <option :value="25">后退入</option>
                                    <option :value="26">后退出</option>
                                    <option :value="27">后退入出</option>
                                    <option :value="28">弹跳入</option>
                                    <option :value="29">弹跳出</option>
                                    <option :value="30">弹跳入出</option>
                                </select>
                            </div>

                            <div class="prop-group prop-inline">
                                <label class="animation-loop">
                                    <input type="checkbox" v-model="anim.loop" />
                                    循环播放
                                </label>
                            </div>

                            <div class="prop-group prop-inline">
                                <button class="animation-btn" @click.stop="$emit('previewAnimation', anim.id)">
                                    预览
                                </button>
                                <button class="animation-btn" @click.stop="$emit('duplicateAnimation', anim.id)">
                                    复制
                                </button>
                                <button class="animation-btn danger" @click.stop="$emit('removeAnimation', anim.id)">
                                    删除
                                </button>
                            </div>
                        </div>
                    </div>
                    <button class="animation-add-btn" @click="$emit('addAnimationForSelected')">添加动画</button>
                </div>
            </div>
        </div>

        <!-- 多选：批量编辑 -->
        <div v-else-if="selectedIds.length > 1">
            <h4>已选择 {{ selectedIds.length }} 个控件</h4>

            <div class="prop-group">
                <label>批量移动 (ΔX / ΔY)</label>
                <div class="prop-inline">
                    <input type="number" v-model.number="batchMove.dx" placeholder="ΔX" title="所有选中控件整体平移的 X 偏移量" />
                    <input type="number" v-model.number="batchMove.dy" placeholder="ΔY" title="所有选中控件整体平移的 Y 偏移量" />
                    <button @click="$emit('applyBatchMove')">应用</button>
                </div>
            </div>

            <div class="prop-group">
                <label>统一宽高</label>
                <div class="prop-inline">
                    <input type="number" v-model.number="batchSize.w" placeholder="宽" title="将所有选中控件的宽度统一为该值（留空则不修改）" />
                    <input type="number" v-model.number="batchSize.h" placeholder="高" title="将所有选中控件的高度统一为该值（留空则不修改）" />
                    <button @click="$emit('applyBatchSize')">应用</button>
                </div>
            </div>

            <div class="prop-group">
                <label for="batch-text">批量文本</label>
                <textarea id="batch-text" name="batch-text" :value="batchText"
                    @input="$emit('update:batchText', $event.target.value)" placeholder="输入要统一设置的文本，留空表示不修改"
                    title="仅对支持文本的控件（标签 / 按钮 / 输入框等）生效"></textarea>
                <button @click="$emit('applyBatchText')">应用到所有选中控件</button>
            </div>

            <div class="prop-group">
                <label>批量图片资源</label>
                <select :value="batchImage" @change="$emit('update:batchImage', $event.target.value)"
                    title="选择一张图片应用到所有支持图片的控件">
                    <option value="">不修改</option>
                    <option v-for="res in imageResources" :key="res.value" :value="res.value">
                        {{ res.label }}（{{ res.value }}）
                    </option>
                </select>
                <label for="batch-image-custom">自定义路径</label>
                <input id="batch-image-custom" type="text" :value="batchImage"
                    @input="$emit('update:batchImage', $event.target.value)" placeholder="填写自定义图片路径（留空表示不修改）" />
                <button @click="$emit('applyBatchImage')">应用到所有选中控件</button>
            </div>

            <div class="prop-group hint-text">
                多选状态下，名称、父节点等属性请在单选时编辑。
            </div>
        </div>

        <div v-else class="empty-tip">在画布中点击控件以编辑属性</div>
    </div>
</template>

<script setup>
const props = defineProps({
    rightWidth: { type: Number, default: 260 },
    selectedWidget: { type: Object, default: null },
    selectedIds: { type: Array, default: () => [] },
    allWidgetTypes: { type: Array, default: () => [] },
    parentCandidates: { type: Array, default: () => [] },
    imageResources: { type: Array, default: () => [] },
    propertyTabs: { type: Array, default: () => [] },
    activePropertyTab: { type: String, default: 'props' },
    currentWidgetAnimations: { type: Array, default: () => [] },
    expandedAnimationId: { type: [Number, String, null], default: null },
    batchMove: { type: Object, required: true },
    batchSize: { type: Object, required: true },
    batchText: { type: String, default: '' },
    batchImage: { type: String, default: '' },
    baseTypeOf: { type: Function, required: true },
    supportsImage: { type: Function, required: true },
});

defineEmits([
    'update:activePropertyTab',
    'toggleAnimationCard',
    'previewAnimation',
    'duplicateAnimation',
    'removeAnimation',
    'addAnimationForSelected',
    'applyBatchMove',
    'applyBatchSize',
    'applyBatchText',
    'applyBatchImage',
    'update:batchText',
    'update:batchImage',
]);
</script>

<style scoped>
/* 复用 App 中的样式类名，保证视觉一致，这里只放必要覆盖 */
.right {
    flex: 0 0 260px;
    background: #252526;
    border-right: none;
    border-left: 1px solid #333;
    user-select: none;
}

.right input,
.right textarea,
.right select {
    user-select: text;
}
</style>
