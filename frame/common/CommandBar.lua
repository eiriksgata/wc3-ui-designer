---@class Frame.CommandBar:Frame
---@field new fun(x:integer,y:integer):Frame.CommandBar
Frame.CommandBar = Class("Frame.CommandBar", Frame)


local instance = Frame:GetInstance()
---@param x integer
---@param y integer
function Frame.CommandBar:ctor(x, y)
    self.handle = xmapi.XMGetCommandButton(x, y)
    self:Set('x', 0)
    self:Set('y', 0)
    self:Set('w', 1920)
    self:Set('h', 1080)
    instance[self.handle] = self
end

---@param fn fun(btn:Frame.CommandBar,x:number,y:number,index:number)
function Frame.CommandBar:Enum(fn)
    local index = 0
    for y = 0, 2 do
        for x = 0, 3 do
            index = index + 1
            fn(Frame.CommandBar:Get(x, y), x, y, index)
        end
    end
end

---@return Frame.CommandBar
function Frame.CommandBar:Get(x, y)
    return Frame:Class(xmapi.XMGetCommandButton(x, y))
end

function Frame.CommandBar:SetNumberTextVisible(visible)
    local button = self.handle
    local overlay = xmapi.XMGetCommandBarButtonNumberOverlay(button)
    lapi.FrameShow(overlay, visible)
end

function Frame.CommandBar:SetNumberText(text)
    local button = self.handle
    local overlay = xmapi.XMGetCommandButtonNumberText(button)
    lapi.FrameSetText(overlay, text)
end

function Frame.CommandBar:SetTexture(image)
    local ui = self:GetHandle()
    lapi.FrameSetTexture(ui, image, 1)
end

---@param params PanelField
---@return Frame.Panel
function Frame.CommandBar:CreateVirtual(unit, params)
    local w, h = self:GetRealSize()
    params.w = w
    params.h = h
    local v = Frame.Panel.new(params)
    lapi.FrameClearAllPoints(v:GetHandle())
    v:SetPoint(4, self, 4, 0, 0)
    self:Register('on_show', function(trg, self, player)
        if player:GetSelectUnit() == unit then
            v:SetVisible(true)
        else
            v:SetVisible(false)
        end
    end)
    self:Register('on_hide', function(trg, self, player)
        v:SetVisible(false)
    end)
    return v
end

for x = 0, 3 do
    for y = 0, 2 do
        Frame.CommandBar.new(x, y)
    end
end
-- local normal = {
--     ---@param unit Unit
--     [Const.Order['attack']] = function(unit)
--         Tip.Show(nil, function(t)
--             t.name = "攻击 |cffffd900[A]|r"
--             t.tips = table.concat({ "攻击指定目标!" }, "\n")
--         end)
--     end,
--     [Const.Order['stop']] = function(unit)
--         Tip.Show(nil, function(t)
--             t.name = "停止 |cffffd900[S]|r"
--             t.tips = "无论你在干什么都先停止下来!"
--         end)
--     end,
--     [Const.Order['build']] = function(unit)
--         Tip.Show(nil, function(t)
--             t.name = "建造 |cffffd900[B]|r"
--             t.tips = "打开建筑列表!"
--         end)
--     end,
--     [Const.Order['patrol']] = function(unit)
--         Tip.Show(nil, function(t)
--             t.name = "巡逻 |cffffd900[P]|r"
--             t.tips = "巡逻指定目标!"
--         end)
--     end,
--     [Const.Order['holdposition']] = function(unit)
--         Tip.Show(nil, function(t)
--             t.name = "坚守位置 |cffffd900[H]|r"
--             t.tips = "坚守当前位置!"
--         end)
--     end,
--     [851975] = function(unit)
--         Tip.Show(nil, function(t)
--             t.name = '取消 |cffffd900[ESC]|r'
--             t.tips = "取消当前的选择"
--             t.art = [[ReplaceableTextures\CommandButtons\BTNCancel.blp]]
--         end)
--     end
-- }

---@type {[number]:fun(player:Player,unit:Unit,x:number,y:number,index:number)}
Frame.CommandBar.EnterEvent = {
    [0] = function(player, unit, x, y, index) --- 命令ID
        local id = xmapi.XMGetCommandButtonAbilityId(x, y)
        Event:Notify('command_enter_order', player, unit, x, y, index, id)
    end,
    [1] = function(player, unit, x, y, index) --- 单位ID
        local id = xmapi.XMGetCommandButtonUnit(x, y)
        Event:Notify('command_enter_unit', player, unit, x, y, index, id)
    end,
    [2] = function(player, unit, x, y, index) --- 物品ID
        local id = xmapi.XMGetCommandButtonItem(x, y)
        Event:Notify('command_enter_item', player, unit, x, y, index, id)
    end,
    [3] = function(player, unit, x, y, index) --- 技能ID
        local id = xmapi.XMGetCommandButtonAbilityId(x, y)
        Event:Notify('command_enter_ability', player, unit, x, y, index, id)
    end
}

Frame.CommandBar:Enum(function(btn, x, y, index)
    btn:Register('on_enter', function(trg, self, player)
        local type = xmapi.XMGetCommandButtonType(x, y)
        local unit = player:GetSelectUnit()
        if unit and Frame.CommandBar.EnterEvent[type] then
            Frame.CommandBar.EnterEvent[type](player, unit, x, y, index)
        end
    end)
    btn:Register('on_leave', function(trg, self, player)
        local unit = player:GetSelectUnit()
        if unit then
            Event:Notify('command_leave', player, unit)
        end
    end)
end)
