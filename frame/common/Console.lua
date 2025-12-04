---@class WidgetDetail
Frame.Console = {}


local function register(ui, show)
    if ui == nil or ui == 0 then
        return
    end
    lapi.FrameSetScriptByCode(ui, lapi.FrameEvent.Show, function()
        if not show then
            lapi.FrameShow(ui, false)
        end
    end)
    for i = 1, xmapi.XMFrameGetChildrenCount(ui, 0) do
        local child = xmapi.XMFrameGetChildren(ui, i)
        lapi.FrameSetScriptByCode(child, lapi.FrameEvent.Show, function()
            if not show then
                lapi.FrameShow(child, false)
            end
        end)
    end
end


---设置单位\物品\可破坏物 面板是否显示
---@param show boolean
Frame.Console.SetWidgetDetailVsiible = function(show)
    register(xmapi.XMSimpleFrameFindByName("SimpleInfoPanelUnitDetail", 0), show)
    register(xmapi.XMSimpleFrameFindByName("SimpleInfoPanelDestructableDetail", 4), show)
    register(xmapi.XMSimpleFrameFindByName("SimpleInfoPanelItemDetail", 3), show)
end


---设置 组 面板是否显示
---@param show boolean
Frame.Console.SetGroupDetailVsiible = function(show)
    register(xmapi.XMFrameGetInfoPanelGroup(), show)
end


--- 设置技能栏按钮是否显示
---@param row number
---@param col number
---@param show boolean
Frame.Console.SetCommandBarVisible = function(row, col, show)
    register(xmapi.XMGetCommandButton(row, col), show)
end

---设置时钟是否显示
---@param show boolean
Frame.Console.SetTimeOfDayVisible = function(show)
    register(xmapi.XMGetTimeOfDayIndicator(), show)
end


---设置时钟模型
---@param path string
Frame.Console.SetTimeOfDayModel = function(path)
    local ui = xmapi.XMGetTimeOfDayIndicator()
    xmapi.XMFrameSetModel(ui, path, -1, 0)
end


--- 设置小地图是否显示
Frame.Console.SetMinimapVisible = function(show)
    register(xmapi.XMGetMinimap(), show)
end

--- 设置小地图位置
Frame.Console.SetMiniMapPos = function(x, y)
    local ui = xmapi.XMGetMinimap()
    lapi.FrameClearAllPoints(ui)
    local size = xmapi.XMFrameGetSize2(ui)
    local gameFrame = xmapi.XMFrameGetParent(ui)
    lapi.FrameSetPoint(ui, xmapi.AnchorType.LEFT_BOTTOM, gameFrame, xmapi.AnchorType.LEFT_BOTTOM, x, y)
    lapi.FrameSetPoint(ui, xmapi.AnchorType.RIGHT_TOP, gameFrame, xmapi.AnchorType.LEFT_BOTTOM, x + size.width,
        y + size.height)
    ---修补移动后点击小地图不正确
    local minX = jass.GetCameraBoundMinX()
    local minY = jass.GetCameraBoundMinY()
    local maxX = jass.GetCameraBoundMaxX()
    local maxY = jass.GetCameraBoundMaxY()
    jass.SetCameraBounds(minX, minY, minX, maxY, maxX, maxY, maxX, minY)
end

--- 设置小地图按钮是否显示
Frame.Console.SetMiniMapButtonVisible = function(panel, btn1, btn2, btn3, btn4, btn5)
    local ui
    ui = xmapi.XMFrameGetMinimapButton(0)
    local parent = xmapi.XMFrameGetParent(ui)
    lapi.FrameShow(parent, panel)
    lapi.FrameShow(ui, btn1)
    ui = xmapi.XMFrameGetMinimapButton(1)
    lapi.FrameShow(ui, btn2)
    ui = xmapi.XMFrameGetMinimapButton(2)
    lapi.FrameShow(ui, btn3)
    ui = xmapi.XMFrameGetMinimapButton(3)
    lapi.FrameShow(ui, btn4)
    ui = xmapi.XMFrameGetMinimapButton(4)
    lapi.FrameShow(ui, btn5)
end

--- 设置小地图背景
function Frame.Console.SetMinimapImage(image)
    xmapi.XMSetMinimapBackgroup(image)
end

--- 设置大头像是否显示
---@param portrait boolean 头像
---@param hp boolean 血量
---@param mp boolean 蓝量
function Frame.Console.SetPortraitVisible(portrait, hp, mp)
    register(xmapi.XMFrameGetPortrait(), portrait)
    register(xmapi.XMFrameGetPortraitHP(), hp)
    register(xmapi.XMFrameGetPortraitMP(), mp)
end

---设置菜单栏按钮是否显示
---@param pos integer 0-3
---@param visible boolean
function Frame.Console.SetUpperButtonVisible(pos, visible)
    register(japi.DzFrameGetUpperButtonBarButton(pos), visible)
end

--- 获得菜单栏按钮
---@param pos integer 0-3
---@return framehandle
function Frame.Console.GetUpperButton(pos)
    return japi.DzFrameGetUpperButtonBarButton(pos)
end

function Frame.Console.SetToolltipsVisible(visible)
    register(japi.DzFrameGetTooltip(), visible)
end

local resource_items = {
    [2] = japi.DzSimpleFontStringFindByName("ResourceBarGoldText", 0),
    [4] = japi.DzSimpleFontStringFindByName("ResourceBarLumberText", 0),
    [6] = japi.DzSimpleFontStringFindByName("ResourceBarSupplyText", 0),
    [7] = japi.DzSimpleFontStringFindByName("ResourceBarUpkeepText", 0),
}
local resource_bar = japi.DzSimpleFrameFindByName("ResourceBarFrame", 0)
local childerns = xmapi.XMFrameGetChildrens(resource_bar, 1)
for index, child in ipairs(childerns) do
    if [[.?AVCSimpleTexture@@]] == xmapi.XMGetFrameClassName(child) then
        local x = xmapi.XMFrameGetX(child, xmapi.AnchorType.LEFT_TOP)
        if x < 0.05 then
            resource_items[1] = child
        elseif x < 0.1 then
            resource_items[3] = child
        elseif x < 0.2 then
            resource_items[5] = child
        end
    end
end

function Frame.Console.SetResourceVisible(Gold, Lumber, Supply, Upkeep)
    lapi.FrameShow(resource_items[1], Gold)
    lapi.FrameShow(resource_items[2], Gold)
    lapi.FrameShow(resource_items[3], Lumber)
    lapi.FrameShow(resource_items[4], Lumber)
    lapi.FrameShow(resource_items[5], Supply)
    lapi.FrameShow(resource_items[6], Supply)
    lapi.FrameShow(resource_items[7], Upkeep)
end

---隐藏鼠标提示
function Frame.Console.HideToolTip()
    register(japi.DzFrameGetTooltip(), false)
end

--- 设置控制台UI是否显示
function Frame.Console.HideInterface()
    japi.DzFrameHideInterface()        -- 隐藏所有界面
    japi.DzFrameEditBlackBorders(0, 0) -- 设置黑边
end

---@return framehandle
function Frame.Console.GetPortrait()
    return xmapi.XMFrameGetPortrait()
end

---@return framehandle
function Frame.Console.GetMinimap()
    return xmapi.XMGetMinimap()
end

---获得英雄按钮 从0开始
---@param index integer
---@return framehandle
function Frame.Console.GetHeroBarButton(index)
    return xmapi.XMFrameGetHeroBarButton(index)
end

---聊天消息界面
---@return framehandle
function Frame.Console.GetChatMessage()
    return xmapi.XMGetWorldFrameChatMessage()
end

---单位消息界面
---@return framehandle
function Frame.Console.GetUnitMessage()
    return xmapi.XMGetWorldFrameUnitMessage()
end

---维修信息界面
---@return framehandle
function Frame.Console.GetTopMessage()
    return xmapi.XMGetWorldFrameTopMessage()
end

---@enum Frame.Console.MessageType
Frame.Console.MessageType = {
    ['维修'] = 0,
    ['错误'] = 1,
    ['聊天'] = 2,
}

---@param player player
---@param msg    string
---@param type   ?Frame.Console.MessageType
---@param time   ?number
function Frame.Console.DisplayTextToPlayer(player, msg, type, time)
    time = time or 2
    type = type or 0
    xmapi.XMDisplayTextToPlayer(player, 0, 0, msg)
end
