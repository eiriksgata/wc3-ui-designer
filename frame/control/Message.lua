---@class Frame.Message:Frame.Panel
---@field new fun(data):Frame.Message
Frame.Message      = Class('Frame.Message', Frame.Panel)

Frame.Message.type = {
    ['系统'] = {
        str   = "|cffffd900[系统]|r:",
        art   = slk.item.afac.art,
        image = [[k.tga]],
    },
    ['警告'] = {
        str   = "|cffff0000[警告]|r:",
        art   = slk.item.ckng.art,
        image = [[k.tga]],
    },
    ['属性'] = {
        str   = "|cff40ff00[属性]|r:",
        art   = slk.item.ratf.art,
        image = [[k.tga]],
    },
}

function Frame.Message:ctor(params)
    Frame.Panel.ctor(self, params)
    self:SetEnable(false)
    ---@type 消息[]
    self.cache = {}
    self:update()
end

function Frame.Message:getCount()
    return #self.cache
end

function Frame.Message:update()
    Event:Register("draw", function(trg)
        if self:getCount() <= 0 then
            return
        end
        for index, panel in ipairs(self.cache) do
            local x, y = panel:GetPosition()
            local targetY = self:GetHeight() - index * 45
            if y ~= targetY then
                local newY = y + (targetY - y) * 0.2 -- 平滑过渡
                panel:SetPosition(x, newY)
            end
        end
    end)
end

---@param type string
---@param data {info:string,art:string}
function Frame.Message:define(type, data)
    self.type[type] = data
end

--- 需要异步调用
---@param msg string
---@param time number
---@param type string
---@param callback fun(self:消息,cur:number,max:number)
function Frame.Message:Add(msg, time, type, callback)
    msg            = tostring(msg) or ""
    type           = type or '系统'
    time           = tonumber(time) or 3
    local data     = self.type[type] or self.type['系统']
    local w, h     = self:GetSize()

    ---@class 消息:Frame.Panel
    local panel    = Frame.Panel.new {
        parent = self,
        y = h,
        h = 40,
        image = data.image,
        {
            name = 'art',
            type = 'Panel',
            x = 5,
            y = 5,
            w = 30,
            h = 30,
            image = data.art
        },
        {
            name = 'text',
            type = 'Text',
            text = string.format("%s%s", data.str, msg),
            x = 40,
            w = 0,
            align = "left",
        },
    }

    panel.callback = callback
    function panel:SetTexture(art)
        panel['art']:SetTexture(art)
    end

    function panel:SetText(text)
        panel['text']:SetText(string.format("%s%s", data.str, text))
        local _w, _h = panel:GetChildrenSize()
        panel:SetSize(_w + 50, _h)
    end

    ---@param ui Frame.Panel
    local function remove(ui)
        ui:Register('on_update', function()
            local x, y = ui:GetPosition()
            local alpha = ui:GetAlpha()
            if alpha > 0 then
                ui:SetPosition(x - 10, y)
                ui:SetAlpha(alpha - 15)
            else
                Frame.Panel.Remove(ui)
            end
        end)
    end

    panel:SetAlpha(0)
    local _w, _h = panel:GetChildrenSize()
    panel:SetSize(_w + 50, _h)
    table.insert(self.cache, 1, panel)
    local startTime = xmapi.XMGetTime()
    panel:Register("on_update", function(trg)
        local alpha = panel:GetAlpha()
        if alpha <= 255 then
            panel:SetAlpha(alpha + 10)
        end
        local current = xmapi.XMGetTime()
        local elapsedTime = current - startTime
        if panel.callback then
            panel.callback(panel, math.floor(elapsedTime), math.floor(time))
        end
        if elapsedTime >= time then
            trg:Remove()
            table.removebyvalue(self.cache, panel)
            remove(panel)
        end
    end)
    -- 限制最大消息数量
    if #self.cache > 10 then
        for i = #self.cache, 1, -1 do
            local ui = self.cache[i]
            if ui.callback == nil then
                table.remove(self.cache, i)
                remove(ui)
                break
            end
        end
    end
end
