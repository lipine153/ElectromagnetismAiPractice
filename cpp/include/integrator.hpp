#pragma once

#include <vector>

#include "vec3.hpp"

enum FieldSelect : int {
    kFieldE = 0,
    kFieldB = 1,
};

// RK4 单步：沿 sign 方向（+1 顺场、-1 逆场）前进 ds
Vec3 rk4Step(int field, int sign, const Vec3& pos, double ds);

// 从 seed 出发追踪一条场线，结果追加进 out。
// 追加格式：[count, (x, y, z, |F|) x count]
//   sign        +1 顺场（从正电荷出发）、-1 逆场（用于负电荷）
//   stopRadius  距任一场源小于该值即停止（在源上收线）
void traceInto(int field, int sign, const Vec3& seed, double step, int maxSteps, double maxRadius,
               double stopRadius, std::vector<float>& out);

// ---------- 自由点电荷（有质量的试探电荷）----------

struct ParticleState {
    Vec3 pos;
    Vec3 vel;
};

/**
 * Boris push 单步：m·dv/dt = q(E + v×B)。
 *
 * 为什么不用 RK4：纯磁场下 RK4 会让回旋半径**系统性**地慢慢变大或变小（能量漂移），
 * 画出来就是螺旋往外/往里。Boris 把磁场那半步步做成**精确旋转**（纯 B 下 |v| 严格守恒），
 * 且整体仍是二阶精度，是粒子推进的标准做法。
 *
 * qOverM = q/m；dt 为子步长。
 */
void borisStep(ParticleState& state, double qOverM, double dt);

/**
 * 推进一个「帧步长」：内部走 substeps 个 borisStep。
 *
 * out 追加格式：[count, stopped, (x, y, z) x count]（本帧的子步采样点，供拖尾折线用）。
 * 撞到点状源或飞出 maxRadius 时**停在原地**（state 回退到最后一个采样点）并置 stopped=1。
 * 返回是否停住。
 */
bool borisAdvance(ParticleState& state, double qOverM, double dt, int substeps, double maxRadius,
                  double stopRadius, std::vector<float>& out);
