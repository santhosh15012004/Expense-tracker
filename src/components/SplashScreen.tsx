import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  Dimensions,
  Platform,
  Easing,
  StatusBar,
} from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
  G,
  Ellipse,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SplashScreenProps {
  onFinish?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const insets = useSafeAreaInsets();

  // Master Exit Animation (at 4000ms -> fades out whole splash over 400ms)
  const [masterFade] = useState(() => new Animated.Value(1));

  // 0 - 1s: Background glow and ambient trails fade in
  const [bgGlowOpacity] = useState(() => new Animated.Value(0));
  const [bgTrailsOpacity] = useState(() => new Animated.Value(0));
  const [bgTrailsScale] = useState(() => new Animated.Value(0.85));

  // 1 - 2s: Logo scale up and glow burst
  const [logoScale] = useState(() => new Animated.Value(0.4));
  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [logoBloomOpacity] = useState(() => new Animated.Value(0));
  const [logoBloomScale] = useState(() => new Animated.Value(0.6));
  const [reflectionOpacity] = useState(() => new Animated.Value(0));

  // 2 - 3s: Golden light sweep orbit, particles, and glint
  const [orbitRotate] = useState(() => new Animated.Value(0));
  const [orbitOpacity] = useState(() => new Animated.Value(0));
  const [orbitScale] = useState(() => new Animated.Value(0.8));
  const [glintTranslate] = useState(() => new Animated.Value(-160));
  const [glintOpacity] = useState(() => new Animated.Value(0));
  const [particlesOpacity] = useState(() => new Animated.Value(0));
  const [particlesPulse] = useState(() => new Animated.Value(0.7));

  // 3 - 4s: Logo settles, final glow, branding text appears
  const [finalPulse] = useState(() => new Animated.Value(1));
  const [brandOpacity] = useState(() => new Animated.Value(0));
  const [brandTranslateY] = useState(() => new Animated.Value(14));

  useEffect(() => {
    // -------------------------------------------------------------
    // Timeline breakdown (Total 4000ms):
    // 0 - 1000ms: Background soft golden glow & ambient arcs fade in
    // 1000ms - 2000ms: Logo scales up smoothly from center with bloom
    // 2000ms - 3000ms: Golden light trail sweeps around logo + particles + glint
    // 3000ms - 4000ms: Logo settles with final glow, app name in bottom-right
    // 4000ms - 4400ms: Smooth transition fade to app home screen
    // -------------------------------------------------------------

    // Phase 1 (0 - 1000ms)
    Animated.parallel([
      Animated.timing(bgGlowOpacity, {
        toValue: 1,
        duration: 950,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bgTrailsOpacity, {
        toValue: 0.9,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bgTrailsScale, {
        toValue: 1.05,
        duration: 2500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // Phase 2 (1000ms - 2000ms): Logo Entry
    const phase2Timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(logoBloomOpacity, {
          toValue: 0.85,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoBloomScale, {
          toValue: 1.25,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(reflectionOpacity, {
          toValue: 0.22,
          duration: 800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, 1000);

    // Phase 3 (2000ms - 3000ms): Light Trail Sweep Orbit & Sparkles
    const phase3Timer = setTimeout(() => {
      // Fade in orbit and particles
      Animated.parallel([
        Animated.timing(orbitOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(orbitScale, {
          toValue: 1.1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(orbitRotate, {
          toValue: 1,
          duration: 1000,
          easing: Easing.bezier(0.2, 0.7, 0.4, 1),
          useNativeDriver: true,
        }),
        Animated.timing(particlesOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(glintOpacity, {
            toValue: 0.85,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(glintTranslate, {
            toValue: 160,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glintOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // Sparkle particles pulsing
      Animated.loop(
        Animated.sequence([
          Animated.timing(particlesPulse, {
            toValue: 1.15,
            duration: 450,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(particlesPulse, {
            toValue: 0.75,
            duration: 450,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }, 2000);

    // Phase 4 (3000ms - 4000ms): Settle, Final Glow & Bottom-Right App Name
    const phase4Timer = setTimeout(() => {
      Animated.parallel([
        // Final gentle pulse on logo
        Animated.sequence([
          Animated.timing(finalPulse, {
            toValue: 1.04,
            duration: 450,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(finalPulse, {
            toValue: 1.0,
            duration: 500,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // App name appears in bottom-right
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(brandTranslateY, {
          toValue: 0,
          duration: 650,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start();
    }, 3000);

    // End at 4000ms: Smooth transition to main app screen
    const endTimer = setTimeout(() => {
      Animated.timing(masterFade, {
        toValue: 0,
        duration: 400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        if (onFinish) {
          onFinish();
        }
      });
    }, 4000);

    return () => {
      clearTimeout(phase2Timer);
      clearTimeout(phase3Timer);
      clearTimeout(phase4Timer);
      clearTimeout(endTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orbitSpin = orbitRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const LOGO_SIZE = 136;

  return (
    <Animated.View style={[styles.container, { opacity: masterFade }]}>
      <StatusBar barStyle="light-content" backgroundColor="#040814" translucent />

      {/* 1. Deep Midnight Blue Luxury Background */}
      <Svg
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <SvgLinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#050B1B" />
            <Stop offset="45%" stopColor="#030713" />
            <Stop offset="100%" stopColor="#02040A" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#bgGrad)" />
      </Svg>

      {/* 2. Soft Golden Central Ambient Glow (0 - 1s) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.centeredLayer,
          { opacity: bgGlowOpacity },
        ]}
        pointerEvents="none"
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
          <Defs>
            <RadialGradient
              id="goldAura"
              cx="50%"
              cy="50%"
              rx="55%"
              ry="45%"
              fx="50%"
              fy="50%"
            >
              <Stop offset="0%" stopColor="#F5B942" stopOpacity="0.32" />
              <Stop offset="25%" stopColor="#D4AF37" stopOpacity="0.18" />
              <Stop offset="55%" stopColor="#8A6B1A" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#050B1B" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="url(#goldAura)" />
        </Svg>
      </Animated.View>

      {/* 3. Golden Curved Ambient Arcs (0 - 1s) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.centeredLayer,
          {
            opacity: bgTrailsOpacity,
            transform: [{ scale: bgTrailsScale }],
          },
        ]}
        pointerEvents="none"
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
          <Defs>
            <SvgLinearGradient id="arcGrad1" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FFEAA7" stopOpacity="0" />
              <Stop offset="50%" stopColor="#F1C40F" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="arcGrad2" x1="1" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
              <Stop offset="50%" stopColor="#F39C12" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#F5B942" stopOpacity="0" />
            </SvgLinearGradient>
          </Defs>

          {/* Sweeping ambient curves around center */}
          <Path
            d={`M -50 ${SCREEN_HEIGHT * 0.35} C ${SCREEN_WIDTH * 0.25} ${SCREEN_HEIGHT * 0.42}, ${SCREEN_WIDTH * 0.75} ${SCREEN_HEIGHT * 0.58}, ${SCREEN_WIDTH + 60} ${SCREEN_HEIGHT * 0.62}`}
            stroke="url(#arcGrad1)"
            strokeWidth="1.6"
            fill="none"
          />
          <Path
            d={`M -40 ${SCREEN_HEIGHT * 0.62} C ${SCREEN_WIDTH * 0.3} ${SCREEN_HEIGHT * 0.56}, ${SCREEN_WIDTH * 0.7} ${SCREEN_HEIGHT * 0.44}, ${SCREEN_WIDTH + 50} ${SCREEN_HEIGHT * 0.38}`}
            stroke="url(#arcGrad2)"
            strokeWidth="1.2"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* 4. Center Logo Container */}
      <View style={styles.centerContainer}>
        {/* Bright Golden Bloom Behind Logo (1 - 2s) */}
        <Animated.View
          style={[
            styles.logoBloom,
            {
              opacity: logoBloomOpacity,
              transform: [{ scale: logoBloomScale }],
            },
          ]}
          pointerEvents="none"
        >
          <Svg width={LOGO_SIZE * 2.4} height={LOGO_SIZE * 2.4}>
            <Defs>
              <RadialGradient
                id="centerBloom"
                cx="50%"
                cy="50%"
                rx="50%"
                ry="50%"
              >
                <Stop offset="0%" stopColor="#FFF2A3" stopOpacity="0.7" />
                <Stop offset="30%" stopColor="#F5B942" stopOpacity="0.5" />
                <Stop offset="60%" stopColor="#D4AF37" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#040814" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle
              cx={LOGO_SIZE * 1.2}
              cy={LOGO_SIZE * 1.2}
              r={LOGO_SIZE * 1.15}
              fill="url(#centerBloom)"
            />
          </Svg>
        </Animated.View>

        {/* 5. Golden Orbit Light Trail (2 - 3s) */}
        <Animated.View
          style={[
            styles.orbitWrapper,
            {
              opacity: orbitOpacity,
              transform: [
                { scale: orbitScale },
                { rotate: orbitSpin },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Svg width={LOGO_SIZE * 2.2} height={LOGO_SIZE * 2.2} viewBox="0 0 260 260">
            <Defs>
              <SvgLinearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#FFF7D6" stopOpacity="1" />
                <Stop offset="30%" stopColor="#F5B942" stopOpacity="0.85" />
                <Stop offset="70%" stopColor="#D4AF37" stopOpacity="0.3" />
                <Stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
              </SvgLinearGradient>
              <RadialGradient id="headGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="40%" stopColor="#FFE07A" stopOpacity="0.9" />
                <Stop offset="100%" stopColor="#F5B942" stopOpacity="0" />
              </RadialGradient>
            </Defs>

            {/* Glowing sweep elliptical ring */}
            <Ellipse
              cx="130"
              cy="130"
              rx="105"
              ry="92"
              stroke="url(#sweepGrad)"
              strokeWidth="3.5"
              fill="none"
              strokeDasharray="460"
              strokeDashoffset="120"
            />
            {/* Blazing Light Sweep Head */}
            <Circle cx="235" cy="130" r="14" fill="url(#headGlow)" />
            <Circle cx="235" cy="130" r="4.5" fill="#FFFFFF" />

            {/* Trailing sparkle glints on the trail */}
            <Circle cx="215" cy="85" r="2.8" fill="#FFF2A3" />
            <Circle cx="180" cy="50" r="2" fill="#FFE07A" />
            <Circle cx="120" cy="38" r="1.5" fill="#D4AF37" />
          </Svg>
        </Animated.View>

        {/* 6. Subtle Gold Sparkles / Floating Particles (2 - 3s) */}
        <Animated.View
          style={[
            styles.particlesWrapper,
            {
              opacity: particlesOpacity,
              transform: [{ scale: particlesPulse }],
            },
          ]}
          pointerEvents="none"
        >
          <Svg width={LOGO_SIZE * 2.4} height={LOGO_SIZE * 2.4} viewBox="0 0 280 280">
            {/* Sparkle 1: Top right */}
            <G transform="translate(225, 48)">
              <Path d="M 0 -7 Q 0 0 7 0 Q 0 0 0 7 Q 0 0 -7 0 Q 0 0 0 -7" fill="#FFF7D6" />
              <Circle cx="0" cy="0" r="1.5" fill="#FFFFFF" />
            </G>
            {/* Sparkle 2: Bottom left */}
            <G transform="translate(45, 215)">
              <Path d="M 0 -6 Q 0 0 6 0 Q 0 0 0 6 Q 0 0 -6 0 Q 0 0 0 -6" fill="#FFE07A" />
            </G>
            {/* Sparkle 3: Left middle */}
            <G transform="translate(30, 95)">
              <Path d="M 0 -5 Q 0 0 5 0 Q 0 0 0 5 Q 0 0 -5 0 Q 0 0 0 -5" fill="#FFF2A3" />
            </G>
            {/* Sparkle 4: Bottom right */}
            <G transform="translate(230, 195)">
              <Path d="M 0 -5 Q 0 0 5 0 Q 0 0 0 5 Q 0 0 -5 0 Q 0 0 0 -5" fill="#F5B942" />
            </G>
            {/* Micro dots */}
            <Circle cx="80" cy="45" r="1.5" fill="#FFEAA7" opacity="0.8" />
            <Circle cx="205" cy="160" r="1.2" fill="#FFEAA7" opacity="0.85" />
            <Circle cx="60" cy="165" r="1.4" fill="#FFDF9E" opacity="0.75" />
            <Circle cx="160" cy="245" r="1.8" fill="#FFF7D6" opacity="0.9" />
          </Svg>
        </Animated.View>

        {/* 7. Animated Main App Logo (1 - 4s) */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: logoOpacity,
              transform: [
                { scale: Animated.multiply(logoScale, finalPulse) },
              ],
            },
          ]}
        >
          <View style={styles.logoCard}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
              resizeMode="cover"
            />

            {/* Diagonal Light Sweep Glint (2 - 3s) */}
            <Animated.View
              style={[
                styles.glintSheen,
                {
                  opacity: glintOpacity,
                  transform: [
                    { translateX: glintTranslate },
                    { rotate: '30deg' },
                  ],
                },
              ]}
              pointerEvents="none"
            >
              <Svg width="50" height={LOGO_SIZE * 1.6}>
                <Defs>
                  <SvgLinearGradient id="glintGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                    <Stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.55" />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="50" height={LOGO_SIZE * 1.6} fill="url(#glintGrad)" />
              </Svg>
            </Animated.View>
          </View>
        </Animated.View>

        {/* 8. Subtle Glossy Reflection Beneath Logo ("Subtle reflection adds premium feel") */}
        <Animated.View
          style={[
            styles.reflectionWrapper,
            {
              opacity: reflectionOpacity,
              transform: [{ scale: Animated.multiply(logoScale, finalPulse) }],
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.reflectionCrop}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.reflectionImage}
              resizeMode="cover"
            />
            {/* Fade out reflection into dark background */}
            <Svg width={LOGO_SIZE} height={50} style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id="reflectMask" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#040814" stopOpacity="0.3" />
                  <Stop offset="65%" stopColor="#040814" stopOpacity="0.85" />
                  <Stop offset="100%" stopColor="#040814" stopOpacity="1" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width={LOGO_SIZE} height={50} fill="url(#reflectMask)" />
            </Svg>
          </View>
        </Animated.View>
      </View>

      {/* 9. Bottom-Right App Name Branding (3 - 4s) */}
      <Animated.View
        style={[
          styles.brandContainer,
          {
            bottom: Math.max(insets.bottom + 20, 72),
            right: Math.max(insets.right + 20, 24),
            opacity: brandOpacity,
            transform: [{ translateY: brandTranslateY }],
          },
        ]}
      >
        <Text style={styles.brandTitle}>Santhosh</Text>
        <Text style={styles.brandSubtitle}>Expense Tracker</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#040814',
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredLayer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 240,
    height: 240,
  },
  logoBloom: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 260,
    height: 260,
  },
  particlesWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 280,
    height: 280,
  },
  logoWrapper: {
    shadowColor: '#F5B942',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 20,
    zIndex: 10,
  },
  logoCard: {
    width: 136,
    height: 136,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#0A152E',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 185, 66, 0.4)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  glintSheen: {
    position: 'absolute',
    top: -30,
    left: 0,
    bottom: -30,
    width: 50,
  },
  reflectionWrapper: {
    position: 'absolute',
    top: 194, // Just below the logo
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 5,
  },
  reflectionCrop: {
    width: 136,
    height: 48,
    overflow: 'hidden',
    borderRadius: 14,
  },
  reflectionImage: {
    width: 136,
    height: 136,
    transform: [{ scaleY: -1 }],
    opacity: 0.4,
  },
  brandContainer: {
    position: 'absolute',
    alignItems: 'flex-end',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFDF9E',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(245, 185, 66, 0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#D4AF37',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginTop: 2,
    opacity: 0.9,
  },
});
