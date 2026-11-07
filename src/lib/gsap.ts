import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin)

export { gsap, ScrollTrigger, SplitText }

export const isFinePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
