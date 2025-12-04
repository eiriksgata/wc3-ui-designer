-- 示例导出插件 (Lua 5.4)
-- 这是一个自定义导出插件的示例，展示了如何自定义导出逻辑
--
-- 插件必须返回一个函数，该函数接收两个参数：
--   widgets: 控件数组，每个控件包含 id, type, x, y, w, h, text, image, parentId 等属性
--   options: 导出选项对象，包含 resourcePath, luaPath, mode, animations 等
--
-- 函数必须返回生成的 Lua 代码字符串

-- 辅助函数：获取相对路径
local function getRelativePath(fromPath, toPath)
    if not fromPath or not toPath then
        return toPath
    end

    local function normalize(path)
        path = path:gsub("\\\\", "/")
        if path:sub(-1) == "/" and #path > 1 then
            path = path:sub(1, -2)
        end
        return path
    end

    local from = normalize(fromPath)
    local to = normalize(toPath)
    local fromDir = from:match("^(.*)/") or ""
    local toDir = to:match("^(.*)/") or ""
    local toFileName = to:match("/([^/]+)$") or to

    if fromDir ~= toDir then
        local fromParts = {}
        for part in fromDir:gmatch("([^/]+)") do
            table.insert(fromParts, part)
        end

        local toParts = {}
        for part in toDir:gmatch("([^/]+)") do
            table.insert(toParts, part)
        end

        local commonLength = 0
        local minLength = math.min(#fromParts, #toParts)
        while commonLength < minLength and
            fromParts[commonLength + 1]:lower() == toParts[commonLength + 1]:lower() do
            commonLength = commonLength + 1
        end

        local upLevels = #fromParts - commonLength
        local relativePath = ""
        if upLevels > 0 then
            relativePath = string.rep("../", upLevels)
        end

        for i = commonLength + 1, #toParts do
            relativePath = relativePath .. toParts[i] .. "/"
        end

        relativePath = relativePath .. toFileName
        return relativePath:gsub("/", "\\\\")
    end

    return toFileName
end

-- 辅助函数：转换图片路径
local function convertImagePath(imagePath, resourcePath, luaPath)
    if not imagePath or not resourcePath or not luaPath then
        return imagePath
    end

    local fileName = imagePath:match("([^/\\\\]+)$") or imagePath
    local sep = resourcePath:find("\\\\") and "\\\\" or "/"
    local resourceFile = resourcePath .. (resourcePath:sub(-1) == "/" or resourcePath:sub(-1) == "\\\\" and "" or sep) .. fileName

    return getRelativePath(luaPath, resourceFile)
end

-- 主导出函数
-- widgets: 控件数组，每个控件是一个表，包含 id, type, x, y, w, h, text, name, image, parentId 等字段
-- options: 导出选项表，包含 resourcePath, luaPath, mode, fileName 等字段
return function(widgets, options)
    if not widgets or #widgets == 0 then
        return ""
    end

    -- 使用导出选项中的 fileName 作为类名（默认为 CustomUI）
    local className = (options and options.fileName) or "CustomUI"

    local lua = ""
    lua = lua .. "---@class " .. className .. ":Frame.Panel\n"
    lua = lua .. "---@field new fun():" .. className .. "\n"
    lua = lua .. "local " .. className .. " = Class('" .. className .. "', Frame.Panel)\n\n"
    lua = lua .. "function " .. className .. ":ctor()\n"
    lua = lua .. "    Frame.Panel.ctor(self, {\n"
    lua = lua .. "        parent = Frame.GameUI,\n"
    lua = lua .. "        x = 0,\n"
    lua = lua .. "        y = 0,\n"
    lua = lua .. "        w = 1920,\n"
    lua = lua .. "        h = 1080,\n"
    lua = lua .. "        image = Const.Texture.blank,\n"
    lua = lua .. "        -- 以下子控件由示例插件生成\n"

    -- 递归函数：生成控件代码
    local function emitWidget(w, indent)
        local pad = string.rep(" ", indent)
        local luaType = "Panel"
        if w.type == "text" then
            luaType = "Text"
        elseif w.type == "button" then
            luaType = "Button"
        elseif w.type == "model" then
            luaType = "Model"
        end

        lua = lua .. pad .. "{\n"
        lua = lua .. pad .. "    name = '" .. (w.name or "") .. "',\n"
        lua = lua .. pad .. "    type = '" .. luaType .. "',\n"
        lua = lua .. pad .. "    x = " .. math.floor(w.x or 0) .. ",\n"
        lua = lua .. pad .. "    y = " .. math.floor(w.y or 0) .. ",\n"
        lua = lua .. pad .. "    w = " .. math.floor(w.w or 0) .. ",\n"
        lua = lua .. pad .. "    h = " .. math.floor(w.h or 0) .. ",\n"

        -- 文本字段：
        -- - Panel / Button 类型不导出 text
        -- - 仅文本类控件在文本非空时才导出 text 字段
        if luaType == "Text" then
            local txt = w.text or ""
            if #txt > 0 then
                lua = lua .. pad .. "    text = [[" .. txt .. "]],\n"
            end
        end

        -- 文本控件的字体/对齐相关属性（对应 frame/control/Text.lua 中的参数）
        if luaType == "Text" then
            if w.font and w.font ~= "" then
                lua = lua .. pad .. "    font_path = [[" .. w.font .. "]],\n"
            end
            if w.fontSize and w.fontSize > 0 then
                lua = lua .. pad .. "    font_size = " .. tostring(w.fontSize) .. ",\n"
            end
            if w.outlineSize and w.outlineSize > 0 then
                -- Text.lua 里 SetOutLine 接收的是一个表：{ width = ... }
                lua = lua .. pad .. "    outline = { width = " .. tostring(w.outlineSize) .. " },\n"
            end
            if w.textAlign and w.textAlign ~= "" then
                lua = lua .. pad .. "    align = '" .. w.textAlign .. "',\n"
            end
        end

        -- 处理图片路径
        if w.image then
            local imagePath = w.image
            if options and options.resourcePath and options.luaPath then
                imagePath = convertImagePath(w.image, options.resourcePath, options.luaPath)
            end
            lua = lua .. pad .. "    image = [[" .. imagePath .. "]],\n"
        end

        -- 处理特殊属性
        if w.type == "checkbox" then
            lua = lua .. pad .. "    checked = " .. (w.checked and "true" or "false") .. ",\n"
        end
        if w.type == "combobox" then
            lua = lua .. pad .. "    selected_index = " .. (w.selectedIndex or 0) .. ",\n"
        end

        -- 处理子控件
        local children = {}
        for _, child in ipairs(widgets) do
            if child.parentId == w.id then
                table.insert(children, child)
            end
        end

        if #children > 0 then
            lua = lua .. pad .. "    -- children\n"
            for _, child in ipairs(children) do
                emitWidget(child, indent + 4)
            end
        end

        lua = lua .. pad .. "},\n"
    end

    -- 只导出根节点（没有 parentId 的控件）
    for _, w in ipairs(widgets) do
        if not w.parentId then
            emitWidget(w, 8)
        end
    end

    lua = lua .. "    })\n"
    lua = lua .. "end\n\n"

    -------------------------------------------------------------------------
    -- 动画导出示例
    --
    -- 在编辑器侧，已经把“按控件 id 分组的动画表”放到了 options.animations 里：
    --   options.animations = {
    --       [widgetId] = {
    --           {
    --               id = 1,
    --               name = "move_right",
    --               type = "move",
    --               duration = 30,   -- 帧
    --               delay = 0,       -- 帧
    --               loop = false,
    --               params = {
    --                   toX = 200,
    --                   toY = 0,
    --                   tweenType = 1, -- 对应 lapi.TWEEN_TYPE
    --               }
    --           },
    --           -- 其它动画...
    --       },
    --       -- 其它控件 id ...
    --   }
    --
    -- 下面这段示例，把这份动画表直接挂到 CustomUI.animations 上，游戏里就可以按需读取。
    -------------------------------------------------------------------------
    local animMap = (options and options.animations) or nil
    if animMap and next(animMap) ~= nil then
        ------------------------------------------------------------------
        -- 将按控件 id 分组的动画表，转换为“按动画名称分组”的表：
        -- CustomUI.animations = {
        --     ['move'] = { { type=..., duration=..., ... }, ... },
        --     ['fade_in'] = { ... },
        -- }
        ------------------------------------------------------------------
        local by_name = {}

        for _, list in pairs(animMap) do
            if type(list) == "table" then
                for _, a in ipairs(list) do
                    local key = a.name or a.type or "anim"
                    local bucket = by_name[key]
                    if not bucket then
                        bucket = {}
                        by_name[key] = bucket
                    end

                    local p = a.params or {}
                    local hasToX = p.toX ~= nil
                    local hasToY = p.toY ~= nil
                    local hasTween = p.tweenType ~= nil

                    local entry = {
                        type = a.type or "",
                        duration = tonumber(a.duration or 0) or 0,
                        delay = tonumber(a.delay or 0) or 0,
                        loop = a.loop and true or false,
                    }

                    if hasToX or hasToY or hasTween then
                        local params = {}
                        if hasToX then params.toX = tonumber(p.toX) or 0 end
                        if hasToY then params.toY = tonumber(p.toY) or 0 end
                        if hasTween then params.tweenType = tonumber(p.tweenType) or 0 end
                        entry.params = params
                    end

                    table.insert(bucket, entry)
                end
            end
        end

        lua = lua .. "-- 动画数据（由示例插件导出，按动画名称分组）\n"
        lua = lua .. className .. ".animations = {\n"

        for name, list in pairs(by_name) do
            -- name 作为 key： ['move'] = { ... }
            lua = lua .. string.format("    ['%s'] = {\n", tostring(name))
            for _, a in ipairs(list) do
                lua = lua .. "        {\n"
                lua = lua .. string.format("            type = [[%s]],\n", a.type or "")
                lua = lua .. string.format("            duration = %d,\n", a.duration or 0)
                lua = lua .. string.format("            delay = %d,\n", a.delay or 0)
                lua = lua .. string.format("            loop = %s,\n", a.loop and "true" or "false")

                local p = a.params or {}
                if p and (p.toX or p.toY or p.tweenType) then
                    lua = lua .. "            params = {\n"
                    if p.toX then
                        lua = lua .. string.format("                toX = %d,\n", tonumber(p.toX) or 0)
                    end
                    if p.toY then
                        lua = lua .. string.format("                toY = %d,\n", tonumber(p.toY) or 0)
                    end
                    if p.tweenType then
                        lua = lua .. string.format("                tweenType = %d,\n", tonumber(p.tweenType) or 0)
                    end
                    lua = lua .. "            },\n"
                end

                lua = lua .. "        },\n"
            end
            lua = lua .. "    },\n"
        end

        lua = lua .. "}\n\n"
        lua = lua .. "return " .. className .. "\n\n"
    end

    return lua
end
