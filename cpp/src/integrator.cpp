#include "integrator.hpp"

#include "field.hpp"

namespace {

Vec3 fieldAt(int field, const Vec3& pos) {
    return field == kFieldE ? evalE(pos) : evalB(pos);
}

}  // namespace

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
