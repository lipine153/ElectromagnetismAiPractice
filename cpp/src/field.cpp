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

// 完全椭圆积分 K(m)、E(m)（参数 m = k²），AGM 迭代
void ellipticKE(double m, double& K, double& E) {
    if (!(m > 0.0)) {  // m <= 0（含圆环轴上）：K = E = π/2
        K = kPi / 2.0;
        E = K;
        return;
    }
    if (m > 1.0 - 1e-12) m = 1.0 - 1e-12;  // 靠近导线时 m -> 1，夹住避免发散

    double a = 1.0;
    double b = std::sqrt(1.0 - m);
    double c = std::sqrt(m);
    double sum = 0.5 * c * c;  // n = 0 项：2^{-1} c_0²
    double power = 1.0;        // n >= 1 项：2^{n-1}
    for (int i = 0; i < 64 && c > 1e-16; ++i) {
        const double an = 0.5 * (a + b);
        const double bn = std::sqrt(a * b);
        c = 0.5 * (a - b);
        a = an;
        b = bn;
        sum += power * c * c;
        power *= 2.0;
    }
    K = kPi / (2.0 * a);
    E = K * (1.0 - sum);
}

// 圆电流环（精确解，用完全椭圆积分）：
//   B_z = μ0I/2π · 1/√((a+ρ)²+z²) · [ K + (a²−ρ²−z²)/((a−ρ)²+z²) · E ]
//   B_ρ = μ0I/2π · (z/ρ) · 1/√((a+ρ)²+z²) · [ −K + (a²+ρ²+z²)/((a−ρ)²+z²) · E ]
//   pos = 圆心，dir = 法向（右手定则，电流沿 +φ），p0 = I，p1 = 半径
Vec3 loopField(const Source& s, const Vec3& pos) {
    const double radius = s.p1;
    const Vec3 normal = s.dir.normalized();
    if (!(radius > 1e-9) || normal.normSq() < 1e-12) return Vec3{};

    const Vec3 rel = pos - s.pos;
    const double z = rel.dot(normal);
    const Vec3 radial = rel - normal * z;
    const double rho = radial.norm();

    // 轴上：B = μ0 I a² / (2 (a²+z²)^{3/2})，方向沿法向
    if (rho < 1e-9) {
        const double d = std::sqrt(radius * radius + z * z);
        return normal * (kMu0 * s.p0 * radius * radius / (2.0 * d * d * d));
    }

    const double sumRho = radius + rho;
    const double diffRho = radius - rho;
    const double rootPlus = std::sqrt(sumRho * sumRho + z * z);
    const double denom = diffRho * diffRho + z * z;
    if (!(rootPlus > 1e-12) || !(denom > 1e-18)) return Vec3{};

    double K = 0.0;
    double E = 0.0;
    ellipticKE(4.0 * radius * rho / (sumRho * sumRho + z * z), K, E);

    const double pref = kMu0 * s.p0 / (2.0 * kPi);
    const double bz = pref / rootPlus * (K + (radius * radius - rho * rho - z * z) / denom * E);
    const double brho =
        pref * z / (rho * rootPlus) * (-K + (radius * radius + rho * rho + z * z) / denom * E);

    return normal * bz + radial * (brho / rho);
}

// 理想磁偶极子：B = μ0/4π · [ 3(m·r̂)r̂ − m ] / r³，dir = 磁矩方向，p0 = m
Vec3 dipoleField(const Source& s, const Vec3& pos) {
    const Vec3 normal = s.dir.normalized();
    if (normal.normSq() < 1e-12) return Vec3{};
    const Vec3 moment = normal * s.p0;

    const Vec3 r = pos - s.pos;
    const double r2 = r.normSq();
    if (r2 < 1e-18) return Vec3{};
    const double rLen = std::sqrt(r2);

    const Vec3 rHat = r * (1.0 / rLen);
    return (rHat * (3.0 * moment.dot(rHat)) - moment) * (kMu0Over4Pi / (r2 * rLen));
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
            case kCurrentLoop:
                b += loopField(s, pos);
                break;
            case kDipole:
                b += dipoleField(s, pos);
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
