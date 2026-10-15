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

// 有限长直导线的毕奥-萨伐尔段场（解析解）：
//   B = μ0 I /4π · (L×a)/|L×a|² · [ (|L|² − a·L)/|b| + (a·L)/|a| ]
//   A = s.pos（起点）、L = dir * p1（段矢量，p1 = 段长）、a = P − A、b = P − B = a − L
// p1 取很大时该式就是"延伸到无穷远"的半无限/无限长导线（段拉长时收敛到 μ0I/2πρ）。
constexpr double kMu0Over4Pi = kMu0 / (4.0 * kPi);

Vec3 wireField(const Source& s, const Vec3& pos) {
    const Vec3 seg = s.dir * s.p1;
    const Vec3 a = pos - s.pos;
    const Vec3 b = a - seg;
    const Vec3 cross = seg.cross(a);

    const double crossSq = cross.normSq();
    if (crossSq < 1e-18) return Vec3{};  // 场点落在导线上

    const double aLen = a.norm();
    const double bLen = b.norm();
    if (aLen < 1e-12 || bLen < 1e-12) return Vec3{};

    const double bracket = (seg.normSq() - a.dot(seg)) / bLen + a.dot(seg) / aLen;
    return cross * (kMu0Over4Pi * s.p0 * bracket / crossSq);
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
    for (const Source& s : g_sources) {
        switch (s.kind) {
            case kStraightWire:
                b += wireField(s, pos);
                break;
            default:
                break;
        }
    }
    return b;
}

double distanceToNearestSource(const Vec3& pos) {
    double best = 1e300;
    for (const Source& s : g_sources) {
        // 线状源（导线）不参与"贴源收线"：磁力线本就环绕导线，不该在导线附近被截断
        if (s.kind == kStraightWire) continue;
        const double d = (pos - s.pos).norm();
        if (d < best) best = d;
    }
    return best;
}
