Frame = Frame or {}

function Frame.PixelW(v)
    v = v or 0
    return v / 1920 * 0.8
end

function Frame.PixelH(v)
    v = v or 0
    return v / 1080 * 0.6
end

function Frame.War3W(v)
    v = v or 0
    return v / 0.8 * 1920
end

function Frame.War3H(v)
    v = v or 0
    return v / 0.6 * 1080
end

function Frame.PixelX(v)
    v = v or 0
    return v / 1920 * 0.8
end

function Frame.PixelY(v)
    v = v or 0
    return v / 1080 * 0.6
end

function Frame.War3X(v)
    v = v or 0
    return v / 0.8 * 1920
end

function Frame.War3Y(v)
    v = v or 0
    return v / 0.6 * 1080
end

---转换到0.8~0.6
function Frame.Pixel(x, y)
    return Frame.PixelX(x), Frame.PixelY(y)
end

---转化到 1920~1080
function Frame.War3(x, y)
    return Frame.War3X(x), Frame.War3Y(y)
end

Frame.MousePosition = function()
    local x      = japi.DzGetMouseXRelative()
    local y      = japi.DzGetMouseYRelative()
    local width  = japi.DzGetClientWidth()
    local height = japi.DzGetClientHeight()
    return x / width * 0.8, y / height * 0.6
end
---设置颜色
---@return integer
function Frame.GetColorInteger(r, g, b, a)
    return (a << 24) | (r << 16) | (g << 8) | (b)
end
