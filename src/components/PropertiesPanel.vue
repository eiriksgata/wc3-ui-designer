<template>
    <div class="right panel" :style="{ width: rightWidth + 'px' }">
        <div class="prop-header">
            <h3>属性面板</h3>
            <v-tabs
                v-if="selectedWidget && selectedIds.length === 1"
                :model-value="activePropertyTab"
                density="compact"
                color="primary"
                class="prop-tabs-vuetify"
                @update:model-value="$emit('update:activePropertyTab', $event)"
            >
                <v-tab
                    v-for="tab in propertyTabs"
                    :key="tab.id"
                    :value="tab.id"
                    class="prop-tab-vuetify"
                >
                    {{ tab.label }}
                </v-tab>
            </v-tabs>
        </div>
        <div class="prop-body">
        <!-- 单选：显示完整属性 -->
        <div v-if="selectedWidget && selectedIds.length === 1">
            <!-- 属性页 -->
            <div v-if="activePropertyTab === 'props'">
                <h4 class="prop-section-title">基础信息</h4>
                <label for="widget-name">名字（导出到 Lua 使用）</label>
                <v-text-field
                    id="widget-name"
                    v-model="selectedWidget.name"
                    density="compact"
                    variant="outlined"
                    hide-details
                    title="控件的名称，用于导出到 Lua"
                />

                <label for="widget-type">类型</label>
                <v-select
                    id="widget-type"
                    v-model="selectedWidget.type"
                    :items="widgetTypeItems"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    title="控件类型"
                />

                <!-- 文本内容 & 文本属性：文本类、或按钮（其内嵌 label）都可编辑。
                     按钮虽然没有 baseType=text，但在组合模型里它承载一段文字。 -->
                <template v-if="baseTypeOf(selectedWidget.type) === 'text' || baseTypeOf(selectedWidget.type) === 'button'">
                    <label for="widget-text">文本</label>
                    <v-textarea
                        id="widget-text"
                        v-model="selectedWidget.text"
                        title="控件显示的文本内容"
                        placeholder="输入文本内容"
                        variant="outlined"
                        rows="3"
                        auto-grow
                        hide-details
                    />

                    <!-- 文本额外属性 -->
                    <h4 class="prop-section-title">文本属性</h4>
                    <div class="prop-group prop-grid-2">
                        <label for="widget-font">字体</label>
                        <v-text-field
                            id="widget-font"
                            v-model="selectedWidget.font"
                            placeholder="例如 DENG.ttf 或字体名"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />

                        <label for="widget-font-size">字体大小</label>
                        <v-text-field
                            id="widget-font-size"
                            type="number"
                            v-model.number="selectedWidget.fontSize"
                            min="1"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />

                        <label for="widget-outline-size">描边大小</label>
                        <v-text-field
                            id="widget-outline-size"
                            type="number"
                            v-model.number="selectedWidget.outlineSize"
                            min="0"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />

                        <label for="widget-text-color">文字颜色</label>
                        <div class="prop-inline">
                            <input
                                id="widget-text-color"
                                type="color"
                                class="prop-color-input"
                                :value="textColorForPicker"
                                @input="onTextColorPicked($event)"
                                title="文字颜色（对应 Text.setColor）"
                            />
                            <v-text-field
                                v-model="selectedWidget.textColor"
                                placeholder="FFFFFF"
                                density="compact"
                                variant="outlined"
                                hide-details
                                maxlength="6"
                                title="十六进制 RGB（无 # 前缀）"
                            />
                        </div>

                        <label for="widget-text-color-preset">颜色预设</label>
                        <v-select
                            id="widget-text-color-preset"
                            :model-value="''"
                            :items="textColorPresetItems"
                            item-title="title"
                            item-value="value"
                            density="compact"
                            variant="outlined"
                            hide-details
                            placeholder="选择预设颜色"
                            @update:model-value="onTextColorPresetPicked"
                        />
                    </div>

                    <label class="prop-section-subtitle">对齐方式</label>
                    <div class="prop-group prop-grid-2">
                        <label for="widget-text-align-h">水平</label>
                        <v-select
                            id="widget-text-align-h"
                            :model-value="alignH"
                            :items="textAlignHItems"
                            item-title="title"
                            item-value="value"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="setAlignH"
                        />
                        <label for="widget-text-align-v">垂直</label>
                        <v-select
                            id="widget-text-align-v"
                            :model-value="alignV"
                            :items="textAlignVItems"
                            item-title="title"
                            item-value="value"
                            density="compact"
                            variant="outlined"
                            hide-details
                            @update:model-value="setAlignV"
                        />
                    </div>
                    <div class="align-grid" title="九宫格快选">
                        <button
                            v-for="cell in alignGridCells"
                            :key="cell.h + '_' + cell.v"
                            type="button"
                            class="align-grid-cell"
                            :class="{ active: alignH === cell.h && alignV === cell.v }"
                            @click="setAlign(cell.h, cell.v)"
                            :title="`${alignLabels.h[cell.h]} / ${alignLabels.v[cell.v]}`"
                        >
                            <span class="align-grid-dot"></span>
                        </button>
                    </div>

                    <label class="prop-section-subtitle">内边距 (TRBL)</label>
                    <div class="prop-group prop-grid-4">
                        <v-text-field
                            type="number"
                            v-model.number="paddingTop"
                            placeholder="上"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                        <v-text-field
                            type="number"
                            v-model.number="paddingRight"
                            placeholder="右"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                        <v-text-field
                            type="number"
                            v-model.number="paddingBottom"
                            placeholder="下"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                        <v-text-field
                            type="number"
                            v-model.number="paddingLeft"
                            placeholder="左"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                    </div>
                </template>

                <!-- 通用基础属性 -->
                <h4 class="prop-section-title">通用属性</h4>
                <div class="prop-group prop-inline prop-inline-checks">
                    <v-checkbox
                        v-model="selectedWidget.enable"
                        label="可交互"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                    <v-checkbox
                        v-model="selectedWidget.visible"
                        label="可见"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                    <v-checkbox
                        v-model="selectedWidget.locked"
                        label="锁定"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                </div>

                <!-- 图片 / 按钮属性 -->
                <template v-if="supportsImage(selectedWidget.type)">
                    <h4 class="prop-section-title">底板 (Backdrop)</h4>

                    <label for="widget-bg-preset">背景预设</label>
                    <v-select
                        id="widget-bg-preset"
                        v-model="selectedWidget.backgroundPreset"
                        :items="uiBackgroundItems"
                        item-title="title"
                        item-value="value"
                        density="compact"
                        variant="outlined"
                        hide-details
                        placeholder="选择一个模板预设（UIBackgrounds）"
                        title="对应模板 Panel.setBackgroundPreset / Button 贴图"
                    />

                    <label for="widget-image-select">图片资源（Frame.image）</label>
                    <v-select
                        id="widget-image-select"
                        v-model="selectedWidget.image"
                        :items="imageResourceItems"
                        item-title="title"
                        item-value="value"
                        density="compact"
                        variant="outlined"
                        hide-details
                        title="选择图片资源"
                    />
                    <label for="widget-image-custom">自定义路径（可直接编辑）</label>
                    <v-text-field
                        id="widget-image-custom"
                        v-model="selectedWidget.image"
                        title="自定义图片路径"
                        placeholder="输入图片路径"
                        density="compact"
                        variant="outlined"
                        hide-details
                    />

                    <label class="prop-section-subtitle">透明度 (0-255)</label>
                    <v-slider
                        v-model.number="alphaValue"
                        :min="0"
                        :max="255"
                        :step="1"
                        density="compact"
                        hide-details
                        thumb-label
                        color="primary"
                    />
                </template>

                <!-- Panel 标题栏 & 关闭按钮 -->
                <template v-if="baseTypeOf(selectedWidget.type) === 'panel'">
                    <h4 class="prop-section-title">标题栏 (Panel)</h4>
                    <div class="prop-group prop-inline prop-inline-checks">
                        <v-checkbox
                            v-model="selectedWidget.showTitleBar"
                            label="显示标题栏"
                            density="compact"
                            hide-details
                            color="primary"
                        />
                        <v-checkbox
                            v-model="selectedWidget.showCloseButton"
                            label="关闭按钮"
                            density="compact"
                            hide-details
                            color="primary"
                        />
                        <v-checkbox
                            v-model="selectedWidget.draggable"
                            label="可拖动"
                            density="compact"
                            hide-details
                            color="primary"
                        />
                    </div>
                    <div class="prop-group prop-grid-2">
                        <label for="widget-title">标题</label>
                        <v-text-field
                            id="widget-title"
                            v-model="selectedWidget.title"
                            placeholder="标题文本"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                        <label for="widget-title-color">标题颜色</label>
                        <v-text-field
                            id="widget-title-color"
                            v-model="selectedWidget.titleColor"
                            placeholder="FFCC00"
                            density="compact"
                            variant="outlined"
                            hide-details
                            maxlength="6"
                        />
                        <label for="widget-title-bar-height">标题栏高度</label>
                        <v-text-field
                            id="widget-title-bar-height"
                            type="number"
                            v-model.number="selectedWidget.titleBarHeight"
                            min="0"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                    </div>
                </template>

                <!-- Button 额外属性 -->
                <template v-if="baseTypeOf(selectedWidget.type) === 'button'">
                    <h4 class="prop-section-title">交互 (Button)</h4>
                    <label for="widget-fdf-template">FDF 模板预设</label>
                    <v-select
                        id="widget-fdf-template"
                        v-model="selectedWidget.fdfTemplate"
                        :items="fdfTemplateItems"
                        item-title="title"
                        item-value="value"
                        density="compact"
                        variant="outlined"
                        hide-details
                        placeholder="ButtonTemplates（可空）"
                        title="对应 Button.createWithTemplate 的 inherits 参数"
                    />

                    <label for="widget-tooltip">Tooltip</label>
                    <v-textarea
                        id="widget-tooltip"
                        v-model="selectedWidget.tooltip"
                        placeholder="鼠标悬停时的提示文字"
                        variant="outlined"
                        rows="2"
                        auto-grow
                        hide-details
                    />

                    <h4 class="prop-subtitle">按钮图片</h4>
                    <label for="widget-btn-image-click">点击图片</label>
                    <v-text-field
                        id="widget-btn-image-click"
                        v-model="selectedWidget.clickImage"
                        placeholder="点击状态图片路径"
                        density="compact"
                        variant="outlined"
                        hide-details
                    />

                    <label for="widget-btn-image-hover">悬浮图片</label>
                    <v-text-field
                        id="widget-btn-image-hover"
                        v-model="selectedWidget.hoverImage"
                        placeholder="鼠标悬浮图片路径"
                        density="compact"
                        variant="outlined"
                        hide-details
                    />

                    <label class="prop-section-subtitle">悬浮效果 (addHoverEffect)</label>
                    <div class="prop-group prop-grid-2">
                        <label for="widget-normal-alpha">常态 Alpha</label>
                        <v-text-field
                            id="widget-normal-alpha"
                            type="number"
                            v-model.number="selectedWidget.normalAlpha"
                            placeholder="255"
                            min="0"
                            max="255"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                        <label for="widget-hover-alpha">悬浮 Alpha</label>
                        <v-text-field
                            id="widget-hover-alpha"
                            type="number"
                            v-model.number="selectedWidget.hoverAlpha"
                            placeholder="180"
                            min="0"
                            max="255"
                            density="compact"
                            variant="outlined"
                            hide-details
                        />
                    </div>

                    <div class="prop-group">
                        <v-checkbox
                            v-model="selectedWidget.draggable"
                            label="是否可以拖动"
                            density="compact"
                            hide-details
                            color="primary"
                        />
                    </div>
                </template>

                <h4 class="prop-section-title">布局</h4>
                <div class="prop-group prop-grid-2">
                    <label for="widget-x">位置 X</label>
                    <v-text-field
                        id="widget-x"
                        type="number"
                        v-model.number="selectedWidget.x"
                        density="compact"
                        variant="outlined"
                        hide-details
                        min="0"
                        :max="maxLayoutX"
                        title="控件在画布上的 X 坐标（0 起算，不超过画布）"
                        @blur="emit('clamp-widgets')"
                    />

                    <label for="widget-y">位置 Y</label>
                    <v-text-field
                        id="widget-y"
                        type="number"
                        v-model.number="selectedWidget.y"
                        density="compact"
                        variant="outlined"
                        hide-details
                        min="0"
                        :max="maxLayoutY"
                        title="控件在画布上的 Y 坐标（0 起算，不超过画布）"
                        @blur="emit('clamp-widgets')"
                    />

                    <label for="widget-w">宽度</label>
                    <v-text-field
                        id="widget-w"
                        type="number"
                        v-model.number="selectedWidget.w"
                        density="compact"
                        variant="outlined"
                        hide-details
                        min="1"
                        :max="maxLayoutW"
                        title="控件的宽度（右下不超过画布）"
                        @blur="emit('clamp-widgets')"
                    />

                    <label for="widget-h">高度</label>
                    <v-text-field
                        id="widget-h"
                        type="number"
                        v-model.number="selectedWidget.h"
                        density="compact"
                        variant="outlined"
                        hide-details
                        min="1"
                        :max="maxLayoutH"
                        title="控件的高度（右下不超过画布）"
                        @blur="emit('clamp-widgets')"
                    />
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
                    <v-checkbox
                        id="widget-checked"
                        v-model="selectedWidget.checked"
                        density="compact"
                        hide-details
                        color="primary"
                    />
                </template>

                <template v-if="selectedWidget.type === 'combobox'">
                    <label for="widget-selected-index">当前选项索引（0/1/2...）</label>
                    <v-text-field
                        id="widget-selected-index"
                        type="number"
                        v-model.number="selectedWidget.selectedIndex"
                        density="compact"
                        variant="outlined"
                        hide-details
                        title="下拉框当前选中的选项索引"
                    />
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
                                <v-text-field
                                    class="animation-name"
                                    v-model="anim.name"
                                    placeholder="动画名称"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                />

                                <label>类型</label>
                                <v-select
                                    v-model="anim.type"
                                    class="animation-type"
                                    :items="animationTypeItems"
                                    item-title="title"
                                    item-value="value"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                />
                            </div>

                            <h5 class="prop-subtitle">播放参数（单位：帧）</h5>
                            <div class="prop-group prop-grid-2">
                                <label>时长 (帧)</label>
                                <v-text-field
                                    type="number"
                                    min="1"
                                    step="1"
                                    v-model.number="anim.duration"
                                    class="animation-number"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                    title="持续时间（帧数）"
                                />

                                <label>延迟 (帧)</label>
                                <v-text-field
                                    type="number"
                                    min="0"
                                    step="1"
                                    v-model.number="anim.delay"
                                    class="animation-number"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                    title="延迟时间（帧数）"
                                />
                            </div>

                            <!-- 仅位移动画时显示目标位置 -->
                            <div v-if="anim.type === 'move'" class="prop-group prop-grid-2">
                                <label>目标 X</label>
                                <v-text-field
                                    type="number"
                                    v-model.number="anim.params.toX"
                                    placeholder="留空=使用当前位置"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                />
                                <label>目标 Y</label>
                                <v-text-field
                                    type="number"
                                    v-model.number="anim.params.toY"
                                    placeholder="留空=使用当前位置"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                />
                            </div>

                            <!-- 缓动类型 -->
                            <h5 class="prop-subtitle">缓动类型</h5>
                            <div class="prop-group">
                                <v-select
                                    v-model.number="anim.params.tweenType"
                                    :items="tweenTypeItems"
                                    item-title="title"
                                    item-value="value"
                                    density="compact"
                                    variant="outlined"
                                    hide-details
                                />
                            </div>

                            <div class="prop-group prop-inline">
                                <v-checkbox
                                    v-model="anim.loop"
                                    label="循环播放"
                                    density="compact"
                                    hide-details
                                    color="primary"
                                    class="animation-loop-check"
                                />
                            </div>

                            <div class="prop-group prop-inline">
                                <v-btn size="small" variant="tonal" class="animation-btn" @click.stop="$emit('previewAnimation', anim.id)">
                                    预览
                                </v-btn>
                                <v-btn size="small" variant="tonal" class="animation-btn" @click.stop="$emit('duplicateAnimation', anim.id)">
                                    复制
                                </v-btn>
                                <v-btn size="small" variant="flat" color="error" class="animation-btn danger" @click.stop="$emit('removeAnimation', anim.id)">
                                    删除
                                </v-btn>
                            </div>
                        </div>
                    </div>
                    <v-btn size="small" variant="flat" color="primary" class="animation-add-btn" @click="$emit('addAnimationForSelected')">添加动画</v-btn>
                </div>
            </div>
        </div>

        <!-- 多选：批量编辑 -->
        <div v-else-if="selectedIds.length > 1">
            <h4>已选择 {{ selectedIds.length }} 个控件</h4>

            <div class="prop-group">
                <label>批量移动 (ΔX / ΔY)</label>
                <div class="prop-inline">
                    <v-text-field
                        type="number"
                        v-model.number="batchMove.dx"
                        placeholder="ΔX"
                        density="compact"
                        variant="outlined"
                        hide-details
                        title="所有选中控件整体平移的 X 偏移量"
                    />
                    <v-text-field
                        type="number"
                        v-model.number="batchMove.dy"
                        placeholder="ΔY"
                        density="compact"
                        variant="outlined"
                        hide-details
                        title="所有选中控件整体平移的 Y 偏移量"
                    />
                    <v-btn size="small" variant="tonal" color="primary" @click="$emit('applyBatchMove')">应用</v-btn>
                </div>
            </div>

            <div class="prop-group">
                <label>统一宽高</label>
                <div class="prop-inline">
                    <v-text-field
                        type="number"
                        v-model.number="batchSize.w"
                        placeholder="宽"
                        density="compact"
                        variant="outlined"
                        hide-details
                        title="将所有选中控件的宽度统一为该值（留空则不修改）"
                    />
                    <v-text-field
                        type="number"
                        v-model.number="batchSize.h"
                        placeholder="高"
                        density="compact"
                        variant="outlined"
                        hide-details
                        title="将所有选中控件的高度统一为该值（留空则不修改）"
                    />
                    <v-btn size="small" variant="tonal" color="primary" @click="$emit('applyBatchSize')">应用</v-btn>
                </div>
            </div>

            <div class="prop-group">
                <label for="batch-text">批量文本</label>
                <v-textarea
                    id="batch-text"
                    :model-value="batchText"
                    @update:model-value="$emit('update:batchText', $event)"
                    placeholder="输入要统一设置的文本，留空表示不修改"
                    title="仅对支持文本的控件（标签 / 按钮 / 输入框等）生效"
                    variant="outlined"
                    rows="3"
                    auto-grow
                    hide-details
                />
                <v-btn size="small" variant="tonal" color="primary" @click="$emit('applyBatchText')">应用到所有选中控件</v-btn>
            </div>

            <div class="prop-group">
                <label>批量图片资源</label>
                <v-select
                    :model-value="batchImage"
                    @update:model-value="$emit('update:batchImage', $event)"
                    :items="imageResourceBatchItems"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    variant="outlined"
                    hide-details
                    title="选择一张图片应用到所有支持图片的控件"
                />
                <label for="batch-image-custom">自定义路径</label>
                <v-text-field
                    id="batch-image-custom"
                    :model-value="batchImage"
                    @update:model-value="$emit('update:batchImage', $event)"
                    placeholder="填写自定义图片路径（留空表示不修改）"
                    density="compact"
                    variant="outlined"
                    hide-details
                />
                <v-btn size="small" variant="tonal" color="primary" @click="$emit('applyBatchImage')">应用到所有选中控件</v-btn>
            </div>

            <div class="prop-group hint-text">
                多选状态下，名称、父节点等属性请在单选时编辑。
            </div>
        </div>

        <div v-else class="empty-tip">
            <div class="empty-tip-title">在画布中点击控件以编辑属性</div>
            <div class="empty-tip-shortcuts">
                <h4 class="shortcuts-title">快捷操作</h4>
                <div class="shortcut-hint">
                    <div class="shortcut-hint-item">
                        <span class="shortcut-hint-icon">🖱️</span>
                        <div class="shortcut-hint-content">
                            <div class="shortcut-hint-desc">拖拽控件</div>
                            <div class="shortcut-hint-key">鼠标左键点击并拖动</div>
                        </div>
                    </div>
                    <div class="shortcut-hint-item">
                        <span class="shortcut-hint-icon">↘️</span>
                        <div class="shortcut-hint-content">
                            <div class="shortcut-hint-desc">缩放控件</div>
                            <div class="shortcut-hint-key">拖动控件右下角</div>
                        </div>
                    </div>
                    <div class="shortcut-hint-item">
                        <div class="shortcut-hint-content">
                            <div class="shortcut-hint-desc">拖动画布</div>
                            <div class="shortcut-hint-key">空格 + 鼠标拖动</div>
                        </div>
                    </div>

                    <div class="shortcut-hint-item">
                        <div class="shortcut-hint-content">
                            <div class="shortcut-hint-desc">缩放画布</div>
                            <div class="shortcut-hint-key">Ctrl + 鼠标滚轮</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getWidgetAlign } from '../types';
import type { Widget, TextAlignH, TextAlignV } from '../types';
import {
    UIBackgrounds,
    ButtonTemplates,
    TextColors,
} from '../constants/templatePresets';

const props = defineProps({
    rightWidth: { type: Number, default: 260 },
    /** 画布逻辑宽高（控件必须完全落在此范围内） */
    canvasWidth: { type: Number, default: 800 },
    canvasHeight: { type: Number, default: 600 },
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

const emit = defineEmits([
    'clamp-widgets',
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

const maxLayoutX = computed(() => {
    const w = props.selectedWidget as { w?: number } | null;
    if (!w) return props.canvasWidth;
    return Math.max(0, props.canvasWidth - (w.w ?? 0));
});
const maxLayoutY = computed(() => {
    const w = props.selectedWidget as { h?: number } | null;
    if (!w) return props.canvasHeight;
    return Math.max(0, props.canvasHeight - (w.h ?? 0));
});
const maxLayoutW = computed(() => {
    const w = props.selectedWidget as { x?: number } | null;
    if (!w) return props.canvasWidth;
    return Math.max(1, props.canvasWidth - (w.x ?? 0));
});
const maxLayoutH = computed(() => {
    const w = props.selectedWidget as { y?: number } | null;
    if (!w) return props.canvasHeight;
    return Math.max(1, props.canvasHeight - (w.y ?? 0));
});

const widgetTypeItems = computed(() =>
    props.allWidgetTypes.map((t) => ({
        title: `${t.label} (${t.id})`,
        value: t.id,
    })),
);

const textAlignHItems = [
    { title: '左', value: 'left' },
    { title: '中', value: 'center' },
    { title: '右', value: 'right' },
];

const textAlignVItems = [
    { title: '上', value: 'top' },
    { title: '中', value: 'middle' },
    { title: '下', value: 'bottom' },
];

const alignLabels = {
    h: { left: '左', center: '中', right: '右' } as Record<TextAlignH, string>,
    v: { top: '上', middle: '中', bottom: '下' } as Record<TextAlignV, string>,
};

const alignGridCells: Array<{ h: TextAlignH; v: TextAlignV }> = [
    { h: 'left', v: 'top' }, { h: 'center', v: 'top' }, { h: 'right', v: 'top' },
    { h: 'left', v: 'middle' }, { h: 'center', v: 'middle' }, { h: 'right', v: 'middle' },
    { h: 'left', v: 'bottom' }, { h: 'center', v: 'bottom' }, { h: 'right', v: 'bottom' },
];

const align = computed(() => {
    const w = props.selectedWidget as Widget | null;
    if (!w) return { h: 'left' as TextAlignH, v: 'top' as TextAlignV };
    return getWidgetAlign(w);
});
const alignH = computed(() => align.value.h);
const alignV = computed(() => align.value.v);

const writeAlign = (h: TextAlignH, v: TextAlignV) => {
    const w = props.selectedWidget as Widget | null;
    if (!w) return;
    w.textAlignH = h;
    w.textAlignV = v;
};
const setAlignH = (h: TextAlignH) => writeAlign(h, alignV.value);
const setAlignV = (v: TextAlignV) => writeAlign(alignH.value, v);
const setAlign = (h: TextAlignH, v: TextAlignV) => writeAlign(h, v);

// 内边距 (TRBL) 双向绑定
const ensurePadding = (): { top: number; right: number; bottom: number; left: number } => {
    const w = props.selectedWidget as Widget | null;
    if (!w) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (!w.padding) w.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    return w.padding;
};
const paddingTop = computed({
    get: () => (props.selectedWidget as Widget | null)?.padding?.top ?? 0,
    set: (v: number) => (ensurePadding().top = Number(v) || 0),
});
const paddingRight = computed({
    get: () => (props.selectedWidget as Widget | null)?.padding?.right ?? 0,
    set: (v: number) => (ensurePadding().right = Number(v) || 0),
});
const paddingBottom = computed({
    get: () => (props.selectedWidget as Widget | null)?.padding?.bottom ?? 0,
    set: (v: number) => (ensurePadding().bottom = Number(v) || 0),
});
const paddingLeft = computed({
    get: () => (props.selectedWidget as Widget | null)?.padding?.left ?? 0,
    set: (v: number) => (ensurePadding().left = Number(v) || 0),
});

const alphaValue = computed({
    get: () => {
        const w = props.selectedWidget as Widget | null;
        return typeof w?.alpha === 'number' ? w.alpha : 255;
    },
    set: (v: number) => {
        const w = props.selectedWidget as Widget | null;
        if (!w) return;
        const n = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
        w.alpha = n;
    },
});

// 文字颜色：HTML color input 需要 #RRGGBB，widget 里存的是无 # 的十六进制
const textColorForPicker = computed(() => {
    const w = props.selectedWidget as Widget | null;
    const raw = (w?.textColor || '').trim();
    if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
    return '#FFFFFF';
});
const onTextColorPicked = (ev: Event) => {
    const w = props.selectedWidget as Widget | null;
    if (!w) return;
    const target = ev.target as HTMLInputElement;
    const val = (target?.value || '').replace(/^#/, '').toUpperCase();
    if (/^[0-9A-Fa-f]{6}$/.test(val)) w.textColor = val;
};
const onTextColorPresetPicked = (value: string) => {
    const w = props.selectedWidget as Widget | null;
    if (!w || !value) return;
    w.textColor = value;
};

const textColorPresetItems = computed(() =>
    Object.entries(TextColors).map(([k, v]) => ({
        title: `${k} (#${v})`,
        value: v,
    })),
);

const uiBackgroundItems = computed(() => [
    { title: '无', value: '' },
    ...Object.entries(UIBackgrounds)
        .filter(([k]) => k !== 'NONE')
        .map(([k, v]) => ({ title: `${k} — ${v}`, value: k })),
]);

const fdfTemplateItems = computed(() => [
    { title: '无（使用默认 Button 背景）', value: '' },
    ...Object.entries(ButtonTemplates).map(([k, v]) => ({
        title: `${k} (${v})`,
        value: k,
    })),
]);

const imageResourceItems = computed(() => [
    { title: '无', value: '' },
    ...props.imageResources.map((res) => ({
        title: `${res.label}（${res.value}）`,
        value: res.value,
    })),
]);

const imageResourceBatchItems = computed(() => [
    { title: '不修改', value: '' },
    ...props.imageResources.map((res) => ({
        title: `${res.label}（${res.value}）`,
        value: res.value,
    })),
]);

const animationTypeItems = [
    { title: '位移动画', value: 'move' },
    { title: '缩放动画', value: 'scale' },
    { title: '透明度动画', value: 'alpha' },
];

const tweenTypeItems = [
    { title: '线性', value: 0 },
    { title: '正弦出', value: 1 },
    { title: '正弦入', value: 2 },
    { title: '正弦出入', value: 3 },
    { title: '二元入', value: 4 },
    { title: '二元出', value: 5 },
    { title: '二元入出', value: 6 },
    { title: '三元入', value: 7 },
    { title: '三元出', value: 8 },
    { title: '三元入出', value: 9 },
    { title: '四元入', value: 10 },
    { title: '四元出', value: 11 },
    { title: '四元出入', value: 12 },
    { title: '五元入', value: 13 },
    { title: '五元出', value: 14 },
    { title: '五元入出', value: 15 },
    { title: '指数入', value: 16 },
    { title: '指数出', value: 17 },
    { title: '指数入出', value: 18 },
    { title: '圆形入', value: 19 },
    { title: '圆形出', value: 20 },
    { title: '圆形入出', value: 21 },
    { title: '弹性入', value: 22 },
    { title: '弹性出', value: 23 },
    { title: '弹性入出', value: 24 },
    { title: '后退入', value: 25 },
    { title: '后退出', value: 26 },
    { title: '后退入出', value: 27 },
    { title: '弹跳入', value: 28 },
    { title: '弹跳出', value: 29 },
    { title: '弹跳入出', value: 30 },
];
</script>

<style scoped>
/* 复用 App 中的样式类名，保证视觉一致，这里只放必要覆盖 */
.right.panel {
    flex: 0 0 260px;
    background: #252526;
    border-right: none;
    border-left: 1px solid #333;
    user-select: none;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 0;
    overflow: hidden;
}

.right input,
.right textarea,
.right select {
    user-select: text;
}

.prop-header {
    flex: 0 0 auto;
    padding: 10px 10px 0;
    background: inherit;
    border-bottom: 1px solid var(--panel-border, #333);
}

.prop-header h3 {
    margin: 0 0 6px;
}

.prop-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 10px 14px;
}

.prop-tabs-vuetify {
    margin-bottom: 0;
}

.prop-tab-vuetify {
    text-transform: none;
    letter-spacing: 0;
    min-width: 52px;
}

.prop-inline-checks {
    gap: 12px;
    align-items: center;
}

.prop-section-subtitle {
    display: block;
    font-size: 11px;
    color: #9aa0a6;
    letter-spacing: 0.3px;
    margin: 10px 0 4px;
}

.prop-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
}

.prop-color-input {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid #444;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
}

.align-grid {
    display: grid;
    grid-template-columns: repeat(3, 28px);
    grid-template-rows: repeat(3, 28px);
    gap: 4px;
    margin: 4px 0 10px;
    justify-content: start;
}

.align-grid-cell {
    width: 28px;
    height: 28px;
    border: 1px solid #3a3a3f;
    border-radius: 3px;
    background: #1e1e1e;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}

.align-grid-cell:hover {
    border-color: #666;
}

.align-grid-cell.active {
    border-color: #4fc3f7;
    background: rgba(79, 195, 247, 0.15);
}

.align-grid-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9aa0a6;
}

.align-grid-cell.active .align-grid-dot {
    background: #4fc3f7;
}

.prop-inline-checks :deep(.v-selection-control) {
    min-height: 28px;
}

.animation-loop-check {
    margin-left: -8px;
}

.empty-tip {
    padding: 20px 16px;
    text-align: center;
    color: #888;
}

.empty-tip-title {
    font-size: 13px;
    margin-bottom: 20px;
    color: #aaa;
}

.empty-tip-shortcuts {
    margin-top: 24px;
}

.shortcuts-title {
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
    text-align: left;
}

.shortcut-hint {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.shortcut-hint-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    background: #1e1e1e;
    border: 1px solid #2d2d30;
    border-radius: 4px;
    text-align: left;
}

.shortcut-hint-icon {
    font-size: 18px;
    flex-shrink: 0;
    margin-top: 2px;
}

.shortcut-hint-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.shortcut-hint-desc {
    font-size: 12px;
    color: #ccc;
    font-weight: 500;
}

.shortcut-hint-key {
    font-size: 11px;
    color: #888;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}
</style>
