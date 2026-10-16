#include "integrator.hpp"

#include "field.hpp"

namespace {

Vec3 fieldAt(int field, const Vec3& pos) {
    return field == kFieldE ? evalE(pos) : evalB(pos);
}

}  // namespace

/** 闭合判定前至少要走的步数，避免刚起步就误判为"绕回起点" */
constexpr int kCloseCheckAfter = 24;

Vec3 rk4Step(int field, int sign, const Vec3& pos, double ds) {
    const double s = static_cast<double>(sign);
    const Vec3 k1 = fieldAt(field, pos).normalized() * s;
    const Vec3 k2 = fieldAt(field, pos + k1 * (0.5 * ds)).normalized() * s;
    const Vec3 k3 = fieldAt(field, pos + k2 * (0.5 * ds)).normalized() * s;
    const Vec3 k4 = fieldAt(field, pos + k3 * ds).normalized() * s;
    return pos + (k1 + k2 * 2.0 + k3 * 2.0 + k4) * (ds / 6.0);
}

void traceInto(int field, int sign, const Vec3& seed, double step, int maxSteps, double maxRadius,
               double stopRadius, std::vector<float>& out) {
    const std::size_t countSlot = out.size();
    out.push_back(0.0f);  // 点数占位，结束后回填

    int count = 0;
    Vec3 current = seed;
    for (int i = 0; i < maxSteps; ++i) {
        const Vec3 f = fieldAt(field, current);
        const double magnitude = f.norm();
        if (magnitude < 1e-12) break;  // 到了场的零点，停
        if (i > 0 && distanceToNearestSource(current) < stopRadius) break;  // 贴到源上，停
        // 绕回起点附近就停：磁力线是闭合的，否则会一圈圈重复画
        if (i > kCloseCheckAfter && (current - seed).norm() < step * 1.5) break;

        out.push_back(static_cast<float>(current.x));
        out.push_back(static_cast<float>(current.y));
        out.push_back(static_cast<float>(current.z));
        out.push_back(static_cast<float>(magnitude));
        ++count;

        current = rk4Step(field, sign, current, step);
        if (current.norm() > maxRadius) break;  // 跑出计算区域，停
    }

    // 逆场追踪时点的顺序与场方向相反；翻转成顺场，
    // 这样折线方向恒等于场方向，前端可以据此直接画方向箭头。
    if (sign < 0) {
        float* base = out.data() + countSlot + 1;
        for (int i = 0, j = count - 1; i < j; ++i, --j) {
            for (int k = 0; k < 4; ++k) {
                const float tmp = base[i * 4 + k];
                base[i * 4 + k] = base[j * 4 + k];
                base[j * 4 + k] = tmp;
            }
        }
    }

    out[countSlot] = static_cast<float>(count);
}

void borisStep(ParticleState& state, double qOverM, double dt) {
    // 半步电场：v⁻ = v + (q/m)E·dt/2
    const Vec3 accel = evalE(state.pos) * qOverM;
    // 旋转向量 t = (q/m)B·dt/2，s = 2t/(1+|t|²)
    const Vec3 t = evalB(state.pos) * (qOverM * dt * 0.5);

    const Vec3 vMinus = state.vel + accel * (0.5 * dt);
    const Vec3 s = t * (2.0 / (1.0 + t.normSq()));
    const Vec3 vPrime = vMinus + vMinus.cross(t);      // v⁻ + v⁻×t
    const Vec3 vPlus = vMinus + vPrime.cross(s);       // 精确旋转后的速度
    state.vel = vPlus + accel * (0.5 * dt);            // 再补半步电场
    state.pos += state.vel * dt;
}

bool borisAdvance(ParticleState& state, double qOverM, double dt, int substeps, double maxRadius,
                  double stopRadius, std::vector<float>& out) {
    out.clear();
    out.push_back(0.0f);  // 点数占位
    out.push_back(0.0f);  // stopped 占位

    int count = 0;
    const auto push = [&out, &count](const Vec3& p) {
        out.push_back(static_cast<float>(p.x));
        out.push_back(static_cast<float>(p.y));
        out.push_back(static_cast<float>(p.z));
        ++count;
    };

    bool stopped = false;
    push(state.pos);  // 本帧起点
    for (int i = 0; i < substeps; ++i) {
        borisStep(state, qOverM, dt);

        // 飞出计算区域、或钻进点状源里：**停在原地**，别把笔头放到界外/源内
        if (state.pos.norm() > maxRadius || distanceToNearestPointSource(state.pos) < stopRadius) {
            state.pos = Vec3{static_cast<double>(out[out.size() - 3]),
                             static_cast<double>(out[out.size() - 2]),
                             static_cast<double>(out[out.size() - 1])};
            stopped = true;
            break;
        }
        push(state.pos);
    }

    out[0] = static_cast<float>(count);
    out[1] = stopped ? 1.0f : 0.0f;
    return stopped;
}
