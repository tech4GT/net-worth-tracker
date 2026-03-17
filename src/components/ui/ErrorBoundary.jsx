import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-64 p-8 text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Something went wrong
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
