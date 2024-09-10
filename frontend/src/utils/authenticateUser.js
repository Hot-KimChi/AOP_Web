// src/utils/authenticateUser.js
export const authenticateUser = async (setUser, setIsAuthenticated) => {
    try {
      const response = await fetch('http://localhost:5000/api/authenticate', {
        method: 'POST',
        credentials: 'include', // 쿠키를 포함하여 요청
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user); // 사용자 정보 설정
        setIsAuthenticated(data.authenticated); // 인증 상태 업데이트
      } else {
        setIsAuthenticated(false); // 인증 실패 시 false로 설정
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setIsAuthenticated(false); // 오류 발생 시 인증 실패 처리
    }
  };
  