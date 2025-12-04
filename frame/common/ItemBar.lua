---@class Frame.ItemBar:Frame
---@field new fun(index:integer):Frame.ItemBar
Frame.ItemBar = Class("Frame.ItemBar", Frame)
local instance = Frame:GetInstance()
---@param index number
function Frame.ItemBar:ctor(index)
    self.handle = xmapi.XMFrameGetItemBarButton(index)
    self:Set('x', 0)
    self:Set('y', 0)
    self:Set('w', 1920)
    self:Set('h', 1080)
    self.name = "ItemBar"
    instance[self.handle] = self
end

---@param index 0~5
---@return Frame.ItemBar
function Frame.ItemBar:Get(index)
    return Frame:Class(xmapi.XMFrameGetItemBarButton(index))
end

---@param fn fun(btn:Frame.ItemBar,i:number)
function Frame.ItemBar:Enum(fn)
    for i = 0, 5 do
        fn(Frame.ItemBar:Get(i), i)
    end
end

for i = 0, 5 do
    Frame.ItemBar.new(i)
end

local set_enable = function()
    wait(0.03, function()
        local player = Player:Local()
        if Player.IsLocal(player) then
            for i = 0, 5 do --- 丢弃拾取物品栏
                local button = xmapi.XMFrameGetItemBarButton(i)
                lapi.FrameShow(button, false)
                lapi.FrameShow(button, true)
            end
        end
    end)
end

Event:Register('unit_pick_item', set_enable)
Event:Register('unit_drop_item', set_enable)

Frame.ItemBar:Enum(function(btn, i)
    btn:Register('on_enter', function(trg, self, player)
        local unit = player:GetSelectUnit()
        if not unit then
            return
        end
        local item = unit:GetSlotItem(i)
        if not item then
            return
        end
        Event:Notify('itembar_enter', player, unit, item, i)
    end)
    btn:Register('on_leave', function(trg, self, player)
        local unit = player:GetSelectUnit()
        if not unit then
            return
        end
        local item = unit:GetSlotItem(i)
        if not item then
            return
        end
        Event:Notify('itembar_leave', player, unit, item, i)
    end)
end)
