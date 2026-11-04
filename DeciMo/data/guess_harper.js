window.DMF_GUESS={
 "question": "Will the person come within 0.2 m of the robot within 1 s?",
 "rounds": [
  {
   "round": 1,
   "A": {
    "window": "xu_act15_30hz__s0:h60:1885",
    "enters": true,
    "time_s": 0.43,
    "p": {
     "DMF": {
      "count": 32,
      "K": 50,
      "p": 0.64
     },
     "CoMusion": {
      "count": 2,
      "K": 50,
      "p": 0.04
     },
     "HumanMAC": {
      "count": 2,
      "K": 50,
      "p": 0.04
     },
     "AINet": {
      "count": 0,
      "K": 1,
      "p": 0.0
     }
    }
   },
   "B": {
    "window": "yf_act14_30hz__s0:h60:1872",
    "enters": false,
    "time_s": null,
    "p": {
     "DMF": {
      "count": 1,
      "K": 50,
      "p": 0.02
     },
     "CoMusion": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "HumanMAC": {
      "count": 1,
      "K": 50,
      "p": 0.02
     },
     "AINet": {
      "count": 0,
      "K": 1,
      "p": 0.0
     }
    }
   },
   "answer": "A",
   "history": "videos/guess_1_history.mp4",
   "reveal": "videos/guess_1_reveal.mp4",
   "history_webm": "videos/guess_1_history.webm",
   "reveal_webm": "videos/guess_1_reveal.webm",
   "poster": "videos/posters/guess_1_history.jpg"
  },
  {
   "round": 2,
   "A": {
    "window": "toa_act5_30hz__s0:h60:1331",
    "enters": false,
    "time_s": null,
    "p": {
     "DMF": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "CoMusion": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "HumanMAC": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "AINet": {
      "count": 0,
      "K": 1,
      "p": 0.0
     }
    }
   },
   "B": {
    "window": "yf_act11_30hz__s0:h60:840",
    "enters": true,
    "time_s": 0.43,
    "p": {
     "DMF": {
      "count": 38,
      "K": 50,
      "p": 0.76
     },
     "CoMusion": {
      "count": 4,
      "K": 50,
      "p": 0.08
     },
     "HumanMAC": {
      "count": 6,
      "K": 50,
      "p": 0.12
     },
     "AINet": {
      "count": 0,
      "K": 1,
      "p": 0.0
     }
    }
   },
   "answer": "B",
   "history": "videos/guess_2_history.mp4",
   "reveal": "videos/guess_2_reveal.mp4",
   "history_webm": "videos/guess_2_history.webm",
   "reveal_webm": "videos/guess_2_reveal.webm",
   "poster": "videos/posters/guess_2_history.jpg"
  },
  {
   "round": 3,
   "A": {
    "window": "yf_act15_30hz__s0:h60:1952",
    "enters": true,
    "time_s": 0.6,
    "p": {
     "DMF": {
      "count": 28,
      "K": 50,
      "p": 0.56
     },
     "CoMusion": {
      "count": 1,
      "K": 50,
      "p": 0.02
     },
     "HumanMAC": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "AINet": {
      "count": 0,
      "K": 1,
      "p": 0.0
     }
    }
   },
   "B": {
    "window": "xy_act15_30hz__s0:h60:2015",
    "enters": false,
    "time_s": null,
    "p": {
     "DMF": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "CoMusion": {
      "count": 1,
      "K": 50,
      "p": 0.02
     },
     "HumanMAC": {
      "count": 0,
      "K": 50,
      "p": 0.0
     },
     "AINet": {
      "count": 0,
      "K": 1,
      "p": 0.0
     }
    }
   },
   "answer": "A",
   "history": "videos/guess_3_history.mp4",
   "reveal": "videos/guess_3_reveal.mp4",
   "history_webm": "videos/guess_3_history.webm",
   "reveal_webm": "videos/guess_3_reveal.webm",
   "poster": "videos/posters/guess_3_history.jpg"
  }
 ],
 "methods": [
  {
   "key": "DMF",
   "name": "DeciMo",
   "color": "#0072B2"
  },
  {
   "key": "CoMusion",
   "name": "CoMusion",
   "color": "#D55E00"
  },
  {
   "key": "HumanMAC",
   "name": "HumanMAC",
   "color": "#882255"
  },
  {
   "key": "AINet",
   "name": "AINet",
   "color": "#4D4D4D"
  }
 ],
 "note": ""
};
