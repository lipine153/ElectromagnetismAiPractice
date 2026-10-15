#include "field.hpp"

#include <cmath>

namespace {

std::vector<Source> g_sources;

// 库仑常数 k = 1/(4π ε0)
constexpr double kCoulomb = 1.0 / (4.0 * kPi * kEpsilon0);

// 距离下限，避免 r -> 0 时数值爆炸
constexpr double kMinR = 1e-3;

// 点电荷的库仑场：E = k q (r - r0) / |r - r0|^3
Vec3 chargeField(const Source& s, const Vec3& pos) {
    const Vec3 d = pos - s.pos;
    const double r2 = d.normSq();
    if (r2 < kMinR * kMinR) return Vec3{};
    return d * (kCoulomb * s.p0 / (r2 * std::sqrt(r2)));
}

}  // namespace

void setSources(const std::vector<Source>& sources) { g_sources = sources; }

void clearSources() { g_sources.clear(); }

Vec3 evalE(const Vec3& pos) {
    Vec3 e{};
    for (const Source& s : g_sources) {
        switch (s.kind) {
            case kCharge:
                e += chargeField(s, pos);
                break;
            default:
                break;
        }
    }
    return e;
}

Vec3 evalB(const Vec3& pos) {
    Vec3 b{};
    // 阶段 0 只有电学场源，磁学部分在后续阶段加入。
    (void)pos;
    return b;
}

double distanceToNearestSource(const Vec3& pos) {
    double best = 1e300;
    for (const Source& s : g_sources) {
        const double d = (pos - s.pos).norm();
        if (d < best) best = d;
    }
    return best;
}
