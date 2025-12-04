---@class Frame.Scroll:Frame.Panel
Frame.Scroll = Class("Scroll", Frame.Panel)
function Frame.Scroll:ctor(params)
    params.image = params.image or Const.Texture.blank
    Frame.Panel.ctor(self, params)
    local w, h        = self:GetSize()
    local parent      = self:GetParent()
    local pw, ph      = parent:GetSize()
    self.event_panel  = Frame.Button.new {
        parent = parent,
        w = pw - w
    }
    self._drag_button = Frame.Button.new {
        parent = self,
        w = w,
        h = w * 2,
        drag = true,
        on_drag = function()
            self:Update()
        end,
        image = Const.Texture.color[11]
    }
    parent:Register('on_show', function()
        self:SetValue(0)
    end)
    self:Register('on_show', function()
        self:SetValue(0)
    end)
    parent:Register('on_wheel', function(a, b, c, delta)
        local value = self:GetValue()
        self:SetValue(value - delta * 0.05)
    end)
end

function Frame.Scroll:Update()
    local parent = self:GetParent()
    if not parent then
        return
    end
    local w, h = self:GetSize()
    local offset = self:GetValue()
    local _, max_height = parent:GetChildrenInitSize()
    if max_height < h then
        offset = 0
    end
    parent:EnumChidrens(function(frame)
        if frame ~= self and frame ~= self.event_panel then
            local inity = frame:Get('_y')
            local x, _ = frame:GetPosition()
            local y = inity - (max_height + 20 - h) * offset
            frame:SetPosition(x, y)
        end
    end)
end

function Frame.Scroll:SetValue(offset)
    offset = math.min(1, offset)
    offset = math.max(0, offset)
    local w, h = self:GetSize()
    self._drag_button:SetPosition(0, (h - w * 2) * offset)
    self:Update()
end

function Frame.Scroll:GetValue()
    local w, h = self:GetSize()
    local x, y = self._drag_button:GetPosition()
    local offset = y / (h - w * 2)
    -- offset = math.min(1, offset)
    -- offset = math.max(0, offset)
    return offset
end
