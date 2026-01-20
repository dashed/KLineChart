/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { KLineData } from '../../common/Data'
import type Coordinate from '../../common/Coordinate'
import type { IndicatorTemplate } from '../../component/Indicator'

interface IchimokuCloud {
  tenkan?: number
  kijun?: number
  chikou?: number
  senkou1?: number
  senkou2?: number
}

/**
 * Get the highest high over a period ending at endIndex
 */
function getHighest (dataList: KLineData[], endIndex: number, period: number): number {
  const startIndex = Math.max(0, endIndex - period + 1)
  let highest = dataList[startIndex].high
  for (let i = startIndex + 1; i <= endIndex; i++) {
    if (dataList[i].high > highest) {
      highest = dataList[i].high
    }
  }
  return highest
}

/**
 * Get the lowest low over a period ending at endIndex
 */
function getLowest (dataList: KLineData[], endIndex: number, period: number): number {
  const startIndex = Math.max(0, endIndex - period + 1)
  let lowest = dataList[startIndex].low
  for (let i = startIndex + 1; i <= endIndex; i++) {
    if (dataList[i].low < lowest) {
      lowest = dataList[i].low
    }
  }
  return lowest
}

/**
 * Draw cloud polygon between senkou1 and senkou2
 */
function drawCloudPolygon (
  ctx: CanvasRenderingContext2D,
  points1: Coordinate[],
  points2: Coordinate[],
  color: string
): void {
  if (points1.length < 2) return

  ctx.beginPath()
  ctx.moveTo(points1[0].x, points1[0].y)

  // Draw upper edge
  for (let i = 1; i < points1.length; i++) {
    ctx.lineTo(points1[i].x, points1[i].y)
  }

  // Draw lower edge in reverse
  for (let i = points2.length - 1; i >= 0; i--) {
    ctx.lineTo(points2[i].x, points2[i].y)
  }

  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

/**
 * Ichimoku Cloud (Ichimoku Kinko Hyo)
 *
 * Components:
 * - Tenkan-sen (Conversion Line): (9-period high + 9-period low) / 2
 * - Kijun-sen (Base Line): (26-period high + 26-period low) / 2
 * - Senkou Span A (Leading Span A): (Tenkan-sen + Kijun-sen) / 2, plotted 26 periods ahead
 * - Senkou Span B (Leading Span B): (52-period high + 52-period low) / 2, plotted 26 periods ahead
 * - Chikou Span (Lagging Span): Close price plotted 26 periods behind
 *
 * Default parameters: [9, 26, 52, 26] (tenkanPeriod, kijunPeriod, senkouBPeriod, displacement)
 */
const ichimokuCloud: IndicatorTemplate<IchimokuCloud, number> = {
  name: 'ICHIMOKU',
  shortName: 'Ichimoku',
  series: 'price',
  calcParams: [9, 26, 52, 26],
  precision: 2,
  shouldOhlc: true,
  figures: [
    { key: 'tenkan', title: 'Tenkan: ', type: 'line' },
    { key: 'kijun', title: 'Kijun: ', type: 'line' },
    { key: 'chikou', title: 'Chikou: ', type: 'line' },
    { key: 'senkou1', title: 'SpanA: ', type: 'line' },
    { key: 'senkou2', title: 'SpanB: ', type: 'line' }
  ],
  calc: (dataList, indicator) => {
    const params = indicator.calcParams
    const tenkanPeriod = params[0]
    const kijunPeriod = params[1]
    const senkouBPeriod = params[2]
    const displacement = params[3]

    // Result array needs extra space for displaced senkou spans
    const resultLength = dataList.length + displacement
    const result: IchimokuCloud[] = []
    for (let i = 0; i < resultLength; i++) {
      result.push({})
    }

    dataList.forEach((kLineData, i) => {
      // Tenkan-sen (Conversion Line)
      if (i >= tenkanPeriod - 1) {
        const tenkan = (getHighest(dataList, i, tenkanPeriod) + getLowest(dataList, i, tenkanPeriod)) / 2
        result[i].tenkan = tenkan
      }

      // Kijun-sen (Base Line)
      if (i >= kijunPeriod - 1) {
        const kijun = (getHighest(dataList, i, kijunPeriod) + getLowest(dataList, i, kijunPeriod)) / 2
        result[i].kijun = kijun
      }

      // Senkou Span A (Leading Span A) - displaced forward
      const tenkanVal = result[i].tenkan
      const kijunVal = result[i].kijun
      if (tenkanVal !== undefined && kijunVal !== undefined) {
        const senkouA = (tenkanVal + kijunVal) / 2
        result[i + displacement].senkou1 = senkouA
      }

      // Senkou Span B (Leading Span B) - displaced forward
      if (i >= senkouBPeriod - 1) {
        const senkouB = (getHighest(dataList, i, senkouBPeriod) + getLowest(dataList, i, senkouBPeriod)) / 2
        result[i + displacement].senkou2 = senkouB
      }

      // Chikou Span (Lagging Span) - displaced backward
      if (i >= displacement) {
        result[i - displacement].chikou = kLineData.close
      }
    })

    return result
  },
  draw: ({ ctx, chart, indicator, xAxis, yAxis }) => {
    const { result } = indicator
    const visibleRange = chart.getVisibleRange()

    // Cloud colors with transparency
    const bullishColor = 'rgba(38, 166, 154, 0.3)'
    const bearishColor = 'rgba(239, 83, 80, 0.3)'

    // Collect cloud points and draw polygons
    let points1: Coordinate[] = []
    let points2: Coordinate[] = []
    let currentIsBullish: boolean | null = null

    for (let i = visibleRange.from; i < visibleRange.to; i++) {
      // Use optional chaining since index may be out of bounds
      const senkou1Val = result[i]?.senkou1
      const senkou2Val = result[i]?.senkou2
      if (senkou1Val !== undefined && senkou2Val !== undefined) {
        const x = xAxis.convertToPixel(i)
        const y1 = yAxis.convertToPixel(senkou1Val)
        const y2 = yAxis.convertToPixel(senkou2Val)
        const isBullish = senkou1Val >= senkou2Val

        if (currentIsBullish !== null && currentIsBullish !== isBullish) {
          // Cloud color changed, draw previous polygon
          drawCloudPolygon(ctx, points1, points2, currentIsBullish ? bullishColor : bearishColor)
          // Start new polygon from last point for continuity
          points1 = points1.length > 0 ? [points1[points1.length - 1]] : []
          points2 = points2.length > 0 ? [points2[points2.length - 1]] : []
        }

        points1.push({ x, y: y1 })
        points2.push({ x, y: y2 })
        currentIsBullish = isBullish
      }
    }

    // Draw remaining polygon
    if (points1.length > 1 && currentIsBullish !== null) {
      drawCloudPolygon(ctx, points1, points2, currentIsBullish ? bullishColor : bearishColor)
    }

    return false // Return false to also draw the default lines
  }
}

export default ichimokuCloud
