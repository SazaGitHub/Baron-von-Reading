import requests
import time

def test_synthesis():
    url = "http://localhost:8001/synthesize"
    # Use Aiden as a test voice (English)
    data = {
        "text": "The quick brown fox jumps over the lazy dog.",
        "speed": 1.0,
        "speaker_wav": "Aiden"
    }
    
    print(f"Sending request to {url}...")
    start = time.time()
    try:
        response = requests.post(url, json=data, timeout=300)
        elapsed = time.time() - start
        print(f"Status Code: {response.status_code}")
        print(f"Time Taken: {elapsed:.2f}s")
        
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type")
            content_len = len(response.content)
            print(f"Content-Type: {content_type}")
            print(f"Content Length: {content_len} bytes")
            if content_len > 1000:
                print("SUCCESS: Received valid audio data.")
                with open("test_output.wav", "wb") as f:
                    f.write(response.content)
                print("Saved to test_output.wav")
            else:
                print("FAILURE: Audio data too short.")
        else:
            print(f"FAILURE: {response.text}")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_synthesis()
