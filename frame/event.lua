local _drag
Event:Register("mouse_left_down", function(trg)
    local ui = Frame:GetFocus()
    if ui == nil then
        return
    end
    ui:Notify('on_left_down')
    if not ui._drag then
        return
    end
    local mx, my = Frame.War3(Frame.MousePosition())
    local ux, uy = ui:GetPosition()
    _drag = {
        target = ui,
        x = mx - ux,
        y = my - uy
    }
end)
Event:Register("mouse_left_up", function(trg)
    _drag = nil
    local ui = Frame:GetFocus()
    if ui == nil then
        return
    end
    ui:Notify('on_left_up')
end)
Event:Register('mouse_right_down', function(trg, params)
    local ui = Frame:GetFocus()
    if ui == nil then
        return
    end
    ui:Notify('on_right_down')
end)
Event:Register('mouse_right_up', function(trg, params)
    local ui = Frame:GetFocus()
    if ui == nil then
        return
    end
    ui:Notify('on_right_up')
end)
Event:Register("mouse_move", function(trg)
    if not _drag then
        return
    end
    ---@type Frame
    local target = _drag.target
    local parent = target:GetParent()
    if not target or not parent then
        _drag = nil
        return
    end
    local ox, oy = _drag.x, _drag.y
    local x, y   = Frame.War3(Frame.MousePosition())
    local xx, yy = x - ox, y - oy
    local w, h   = target:GetSize()
    local pw, ph = parent:GetSize()
    xx           = math.max(0, math.min(xx, pw - w))
    yy           = math.max(0, math.min(yy, ph - h))
    target:SetPosition(xx, yy)
    target:Notify('on_drag')
end)
