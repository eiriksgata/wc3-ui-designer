---@class select_diff:Frame.Panel
---@field new fun():select_diff
local select_diff = Class('select_diff', Frame.Panel)

function select_diff:ctor()
    Frame.Panel.ctor(self, {
        parent = Frame.GameUI,
        x = 0,
        y = 0,
        w = 1920,
        h = 1080,
        image = Const.Texture.blank,
        -- 以下子控件由示例插件生成
        {
            name = '按钮1',
            type = 'Button',
            x = 410,
            y = 260,
            w = 140,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '0',
            type = 'Button',
            x = 350,
            y = 110,
            w = 970,
            h = 730,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\bgk_xznd.tga]],
        },
        {
            name = '按钮2',
            type = 'Button',
            x = 560,
            y = 260,
            w = 140,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '3',
            type = 'Button',
            x = 710,
            y = 260,
            w = 140,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '4',
            type = 'Panel',
            x = 420,
            y = 400,
            w = 150,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '5',
            type = 'Panel',
            x = 420,
            y = 460,
            w = 150,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '6',
            type = 'Panel',
            x = 420,
            y = 520,
            w = 150,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '7',
            type = 'Panel',
            x = 420,
            y = 580,
            w = 150,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '8',
            type = 'Panel',
            x = 420,
            y = 640,
            w = 150,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\btn_nor.tga]],
        },
        {
            name = '9',
            type = 'Text',
            x = 630,
            y = 340,
            w = 290,
            h = 420,
            text = [[文本]],
            image = [[C:\Users\dusheng\Desktop\UI设计器\out]],
        },
        {
            name = '10',
            type = 'Text',
            x = 940,
            y = 340,
            w = 330,
            h = 420,
            text = [[文本]],
            image = [[C:\Users\dusheng\Desktop\UI设计器\out]],
        },
        {
            name = '11',
            type = 'Panel',
            x = 870,
            y = 260,
            w = 110,
            h = 50,
            image = [[C:\Users\dusheng\Desktop\UI设计器\out\\按钮.tga]],
        },
    })
end

-- 动画数据（由示例插件导出，按动画名称分组）
select_diff.animations = {
    ['move'] = {
        {
            type = [[move]],
            duration = 1,
            delay = 0,
            loop = true,
            params = {
                toX = 450,
                toY = 120,
                tweenType = 29,
            },
        },
    },
    ['透明动画'] = {
        {
            type = [[alpha]],
            duration = 1,
            delay = 0,
            loop = true,
            params = {
                tweenType = 0,
            },
        },
    },
}

return select_diff

