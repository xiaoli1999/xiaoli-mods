/**
 * @description 小小黎面板的自绘区域：按行画出 hooks 排好的内容，点击只认行号不认列，
 * 所以 JetBrains 终端点中文时上报的列偏移不影响命中
 * @author xiao li
 * @createDate 2026-10-21 18:00
 */
import type { ClientModule, TextProps } from 'claude-code'
import type { BoardLineType, SegType } from './layout'

/** Client 的 props 必须是 JsonValue，所以用 type */
export type BoardPropsType = {
    lineList: BoardLineType[]
}

/** 发回 hooks 的消息：点中了哪一行的动作，'' 为点在没有动作的行上 */
export type BoardPostType = {
    type: 'row'
    action: string
}

/**
 * 整行命中：第 y 行的动作，只看行号；行外或该行没有动作返回 ''。
 * @param lineList 面板的每一行
 * @param y 点击所在的行，0 为区域首行
 * @returns 动作
 */
export const actionAt = (lineList: readonly BoardLineType[], y: number): string => lineList[y]?.action ?? ''

/** 一段文字的样式转成内嵌 Text 的属性 */
const segProps = (seg: SegType): TextProps => ({
    ...(seg.color ? { color: seg.color } : {}),
    ...(seg.bold ? { bold: true } : {}),
    ...(seg.dim ? { dimColor: true } : {}),
    ...(seg.strike ? { strikethrough: true } : {})
})

export const Board: ClientModule<BoardPropsType> = (props, surface) => {
    const { Box, Text } = surface.elements
    /* 每次绘制都换上新的监听（后设的替换先设的），闭包里拿到的就是这次的行 */
    surface.onPointer(e => {
        if (e.type !== 'down' || e.button !== 'left') return

        const data: BoardPostType = { type: 'row', action: actionAt(props.lineList, e.y) }
        surface.post(data)
    })

    /* 每行是一个 Text、各段是内嵌 Text：整行按 hooks 算好的宽度原样排，不走 flex 收缩，右侧定宽列不会被挤走 */
    return (
        <Box flexDirection="column">
            {props.lineList.map(line => (
                <Box
                    height={1}
                    overflow="hidden"
                >
                    <Text wrap="truncate-end">
                        {line.segList.map(seg => (
                            <Text {...segProps(seg)}>{seg.text}</Text>
                        ))}
                    </Text>
                </Box>
            ))}
        </Box>
    )
}
