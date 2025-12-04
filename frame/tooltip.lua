Tooltip = {}

local _group = {}
local _auto_group = {}

local GetMousePos = function()
    local x = japi.DzGetMouseXRelative()
    local y = japi.DzGetMouseYRelative()
    local width = japi.DzGetClientWidth()
    local height = japi.DzGetClientHeight()
    return { x = x / width * 0.8, y = 0.6 - (y / height * 0.6) }
end

local function _OverMouse()
    local c = 0
    local mousePos = GetMousePos()
    for index, value in SafePairs(_group) do
        c = c + 1
        japi.DzFrameSetAbsolutePoint(index, value.anchorType, mousePos.x + value.x, mousePos.y + value.y)
    end
end

local function _OverMouseAuto()
    local c = 0
    local width
    local height
    local x, y
    local mousePos = GetMousePos()
    for index, anchorType in SafePairs(_auto_group) do
        c = c + 1

        local size = lapi.FrameGetSize(index)
        width = size.width
        height = size.height
        if anchorType == lapi.FramePoints.LEFT_TOP then
            if mousePos.x > width then
                x = -0.01 - width
                if (0.6 - mousePos.y) > height then
                    y = 0.01
                else
                    y = -0.01 - height
                end
            else
                x = 0.01
                if (0.6 - mousePos.y) > height then
                    y = 0.01
                else
                    y = -0.01 - height
                end
            end
        elseif anchorType == lapi.FramePoints.RIGHT_TOP then
            if (0.8 - mousePos.x) > width then
                x = 0.01
                if (0.6 - mousePos.y) > height then
                    y = 0.01
                else
                    y = -0.01 - height
                end
            else
                x = -0.01 - width
                if (0.6 - mousePos.y) > height then
                    y = 0.01
                else
                    y = -0.01 - height
                end
            end
        elseif anchorType == lapi.FramePoints.RIGHT_BOTTOM then
            if (0.8 - mousePos.x) > width then
                x = 0.01
                if mousePos.y > height then
                    y = -0.01 - height
                else
                    y = 0.01
                end
            else
                x = -0.01 - width
                if mousePos.y > height then
                    y = -0.01 - height
                else
                    y = 0.01
                end
            end
        else
            if mousePos.x > width then
                x = -0.01 - width
                if mousePos.y > height then
                    y = -0.01 - height
                else
                    y = 0.01
                end
            else
                x = 0.01
                if mousePos.y > height then
                    y = -0.01 - height
                else
                    y = 0.01
                end
            end
        end



        x = mousePos.x + x
        if x < 0 then
            x = 0
        end
        if x + width > 0.8 then
            x = 0.8 - width
        end
        y = mousePos.y + y
        if y < 0 then
            y = 0
        end
        if y + height > 0.6 then
            y = 0.6 - height
        end
        japi.DzFrameSetAbsolutePoint(index, lapi.FramePoints.LEFT_BOTTOM, x, y)
    end
end

---跟随鼠标,固定位置
---@param frame framehandle
---@param anchorType lapi.FramePoints
---@param x number
---@param y number
function Tooltip.OverMouse(frame, anchorType, x, y)
    _group[frame] = {
        anchorType = anchorType,
        x = x,
        y = y
    }
    japi.DzFrameClearAllPoints(frame)
end

---跟随鼠标,自动调整位置
---@param frame framehandle
---@param anchorType lapi.FramePoints?
function Tooltip.OverMouseAuto(frame, anchorType)
    _auto_group[frame] = anchorType or lapi.FramePoints.RIGHT_BOTTOM
    japi.DzFrameClearAllPoints(frame)
end

function Tooltip.OverCancel(frame)
    _group[frame] = nil
    _auto_group[frame] = nil
end

Event:Register("mouse_move", function(trg)
    _OverMouse()
    _OverMouseAuto()
end)
